import { PersonType } from '~/types'
import React from 'react'
import { IconPersonFilled } from 'lib/components/icons'
import './PersonHeader.scss'
import { Link } from 'lib/components/Link'
import { urls } from 'scenes/urls'

export interface PersonHeaderProps {
    person?: Partial<PersonType> | null
    withIcon?: boolean
}

export const asDisplay = (person: Partial<PersonType> | null | undefined): string => {
    let displayId
    const propertyIdentifier = person?.properties
        ? person.properties.email || person.properties.name || person.properties.username
        : 'with no IDs'
    const customIdentifier =
        typeof propertyIdentifier === 'object' ? JSON.stringify(propertyIdentifier) : propertyIdentifier

    if (!person?.distinct_ids?.length) {
        displayId = null
    } else {
        const baseId = person.distinct_ids[0].replace(/\W/g, '')
        displayId = baseId.substr(baseId.length - 5).toUpperCase()
    }

    return customIdentifier ? customIdentifier : `User ${displayId}`
}

export const asLink = (person: Partial<PersonType> | null | undefined): string | undefined =>
    person?.distinct_ids?.length ? urls.person(person.distinct_ids[0]) : undefined

export function PersonHeader(props: PersonHeaderProps): JSX.Element {
    return (
        <Link to={asLink(props.person)} data-attr={`goto-person-email-${props.person?.distinct_ids?.[0]}`}>
            <div className="person-header">
                {props.withIcon && <IconPersonFilled className="icon" />}
                <span className="ph-no-capture text-ellipsis">{asDisplay(props.person)}</span>
            </div>
        </Link>
    )
}
