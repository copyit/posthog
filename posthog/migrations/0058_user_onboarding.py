# Generated by Django 3.0.5 on 2020-06-03 17:31

import django.contrib.postgres.fields.jsonb
from django.db import migrations
from posthog.models.user import default_onboarding_dict, User


def update_old_rows(apps, schema_editor):
    User.objects.all().update(onboarding={'active': False, 'initial': False, 'steps': {0: True, 1: True, 2: True}})

class Migration(migrations.Migration):

    dependencies = [
        ('posthog', '0057_action_updated_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='onboarding',
            field=django.contrib.postgres.fields.jsonb.JSONField(default=default_onboarding_dict),
        ),
        migrations.RunPython(update_old_rows)
    ]
