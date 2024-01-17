from datetime import datetime, timedelta
from typing import Optional

from django.conf import settings
import structlog
from prometheus_client import Counter
from sentry_sdk import capture_exception, capture_message

from ee.tasks.subscriptions.email_subscriptions import send_email_subscription_report
from ee.tasks.subscriptions.slack_subscriptions import send_slack_subscription_report
from ee.tasks.subscriptions.subscription_utils import generate_assets
from posthog.celery import app
from posthog.models.subscription import Subscription

logger = structlog.get_logger(__name__)

SUBSCRIPTION_QUEUED = Counter(
    "subscription_queued",
    "A subscription was queued for delivery",
    labelnames=["destination"],
)
SUBSCRIPTION_SUCCESS = Counter(
    "subscription_send_success",
    "A subscription was sent successfully",
    labelnames=["destination"],
)
SUBSCRIPTION_FAILURE = Counter(
    "subscription_send_failure",
    "A subscription failed to send",
    labelnames=["destination"],
)


def _deliver_subscription_report(
    subscription_id: int,
    previous_value: Optional[str] = None,
    invite_message: Optional[str] = None,
) -> None:
    subscription = (
        Subscription.objects.prefetch_related("dashboard__insights")
        .select_related("created_by", "insight", "dashboard")
        .get(pk=subscription_id)
    )

    is_new_subscription_target = False
    if previous_value is not None:
        # If previous_value is set we are triggering a "new" or "invite" message
        is_new_subscription_target = subscription.target_value != previous_value

        if not is_new_subscription_target:
            # Same value as before so nothing to do
            return

    insights, assets = generate_assets(subscription)

    if not assets:
        capture_message(
            "No assets are in this subscription",
            tags={"subscription_id": subscription.id},
        )
        return

    if subscription.target_type == "email":
        SUBSCRIPTION_QUEUED.labels(destination="email").inc()

        # Send emails
        emails = subscription.target_value.split(",")
        if is_new_subscription_target:
            previous_emails = previous_value.split(",") if previous_value else []
            emails = list(set(emails) - set(previous_emails))

        for email in emails:
            try:
                send_email_subscription_report(
                    email,
                    subscription,
                    assets,
                    invite_message=invite_message or "" if is_new_subscription_target else None,
                    total_asset_count=len(insights),
                )
            except Exception as e:
                SUBSCRIPTION_FAILURE.labels(destination="email").inc()
                logger.error(
                    "sending subscription failed",
                    subscription_id=subscription.id,
                    next_delivery_date=subscription.next_delivery_date,
                    destination=subscription.target_type,
                    exc_info=True,
                )
                capture_exception(e)

        SUBSCRIPTION_SUCCESS.labels(destination="email").inc()

    elif subscription.target_type == "slack":
        SUBSCRIPTION_QUEUED.labels(destination="slack").inc()

        try:
            send_slack_subscription_report(
                subscription,
                assets,
                total_asset_count=len(insights),
                is_new_subscription=is_new_subscription_target,
            )
            SUBSCRIPTION_SUCCESS.labels(destination="slack").inc()
        except Exception as e:
            SUBSCRIPTION_FAILURE.labels(destination="slack").inc()
            logger.error(
                "sending subscription failed",
                subscription_id=subscription.id,
                next_delivery_date=subscription.next_delivery_date,
                destination=subscription.target_type,
                exc_info=True,
            )
            capture_exception(e)
    else:
        raise NotImplementedError(f"{subscription.target_type} is not supported")

    if not is_new_subscription_target:
        subscription.set_next_delivery_date(subscription.next_delivery_date)
        subscription.save()


@app.task()
def schedule_all_subscriptions() -> None:
    """
    Schedule all past notifications (with a buffer) to be delivered
    NOTE: This task is scheduled hourly just before the hour allowing for the 15 minute timedelta to cover
    all upcoming hourly scheduled subscriptions
    """
    now_with_buffer = datetime.utcnow() + timedelta(minutes=15)
    subscriptions = (
        Subscription.objects.filter(next_delivery_date__lte=now_with_buffer, deleted=False)
        .exclude(dashboard__deleted=True)
        .exclude(insight__deleted=True)
        .all()
    )

    for subscription in subscriptions:
        logger.info(
            "Scheduling subscription",
            subscription_id=subscription.id,
            next_delivery_date=subscription.next_delivery_date,
            destination=subscription.target_type,
        )
        deliver_subscription_report.delay(subscription.id)


@app.task()
def deliver_subscription_report(subscription_id: int) -> None:
    if not settings.TEST:
        return
    return _deliver_subscription_report(subscription_id)


@app.task()
def handle_subscription_value_change(
    subscription_id: int, previous_value: str, invite_message: Optional[str] = None
) -> None:
    return _deliver_subscription_report(subscription_id, previous_value, invite_message)
