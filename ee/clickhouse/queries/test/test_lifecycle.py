from datetime import datetime
from uuid import uuid4

from ee.clickhouse.models.event import create_event
from ee.clickhouse.models.group import create_group
from ee.clickhouse.queries.trends.clickhouse_trends import ClickhouseTrends
from ee.clickhouse.test.test_journeys import journeys_for
from ee.clickhouse.util import ClickhouseTestMixin, snapshot_clickhouse_queries
from posthog.constants import FILTER_TEST_ACCOUNTS, TRENDS_LIFECYCLE
from posthog.models.action import Action
from posthog.models.action_step import ActionStep
from posthog.models.filters.filter import Filter
from posthog.models.group_type_mapping import GroupTypeMapping
from posthog.models.person import Person
from posthog.queries.test.test_lifecycle import lifecycle_test_factory


def _create_action(**kwargs):
    team = kwargs.pop("team")
    name = kwargs.pop("name")
    action = Action.objects.create(team=team, name=name)
    ActionStep.objects.create(action=action, event=name)
    return action


def _create_event(**kwargs):
    kwargs.update({"event_uuid": uuid4()})
    create_event(**kwargs)


class TestClickhouseLifecycle(ClickhouseTestMixin, lifecycle_test_factory(ClickhouseTrends, _create_event, Person.objects.create, _create_action)):  # type: ignore
    @snapshot_clickhouse_queries
    def test_test_account_filters_with_groups(self):
        self.team.test_account_filters = [
            {"key": "key", "type": "group", "value": "value", "group_type_index": 0},
        ]
        self.team.save()

        GroupTypeMapping.objects.create(team=self.team, group_type="organization", group_type_index=0)
        create_group(self.team.pk, group_type_index=0, group_key="in", properties={"key": "value"})
        create_group(self.team.pk, group_type_index=0, group_key="out", properties={"key": "othervalue"})

        Person.objects.create(distinct_ids=["person1"], team_id=self.team.pk)
        Person.objects.create(distinct_ids=["person2"], team_id=self.team.pk)
        journeys_for(
            {
                "person1": [
                    {"event": "$pageview", "timestamp": datetime(2020, 1, 11, 12), "properties": {"$group_0": "out"},},
                ],
                "person2": [
                    {"event": "$pageview", "timestamp": datetime(2020, 1, 9, 12), "properties": {"$group_0": "in"},},
                    {"event": "$pageview", "timestamp": datetime(2020, 1, 12, 12), "properties": {"$group_0": "in"},},
                    {"event": "$pageview", "timestamp": datetime(2020, 1, 15, 12), "properties": {"$group_0": "in"},},
                ],
            },
            self.team,
        )

        result = ClickhouseTrends().run(
            Filter(
                data={
                    "date_from": "2020-01-12T00:00:00Z",
                    "date_to": "2020-01-19T00:00:00Z",
                    "events": [{"id": "$pageview", "type": "events", "order": 0}],
                    "shown_as": TRENDS_LIFECYCLE,
                    FILTER_TEST_ACCOUNTS: True,
                },
                team=self.team,
            ),
            self.team,
        )

        self.assertEqual(sorted(res["status"] for res in result), ["dormant", "new", "resurrecting", "returning"])
        for res in result:
            if res["status"] == "dormant":
                self.assertEqual(res["data"], [0, -1, 0, 0, -1, 0, 0, 0])
            elif res["status"] == "returning":
                self.assertEqual(res["data"], [0, 0, 0, 0, 0, 0, 0, 0])
            elif res["status"] == "resurrecting":
                self.assertEqual(res["data"], [1, 0, 0, 1, 0, 0, 0, 0])
            elif res["status"] == "new":
                self.assertEqual(res["data"], [0, 0, 0, 0, 0, 0, 0, 0])
