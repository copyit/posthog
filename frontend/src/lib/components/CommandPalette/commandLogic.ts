import { kea } from 'kea'
import { router } from 'kea-router'
import { commandLogicType } from 'types/lib/components/CommandPalette/commandLogicType'
import Fuse from 'fuse.js'
import { dashboardsModel } from '~/models/dashboardsModel'

import {
    FundOutlined,
    RiseOutlined,
    ContainerOutlined,
    AimOutlined,
    SyncOutlined,
    ClockCircleOutlined,
    UserOutlined,
    UsergroupAddOutlined,
    ExperimentOutlined,
    SettingOutlined,
    MessageOutlined,
    TeamOutlined,
    BookOutlined,
    FunnelPlotOutlined,
    GatewayOutlined,
    InteractionOutlined,
    HeartOutlined,
    LogoutOutlined,
    PlusOutlined,
    LineChartOutlined,
} from '@ant-design/icons'
import { DashboardType } from '~/types'

export type CommandExecutor = () => void

export interface CommandResultTemplate {
    key: string // string for sorting results according to typed text
    icon: any // any, because Ant Design icons are some weird ForwardRefExoticComponent type
    display: string
    synonyms?: string[]
    prefixApplied?: string
    executor: CommandExecutor
}

export type CommandResult = CommandResultTemplate & {
    command: Command
}

export type CommandResolver = (argument?: string, prefixApplied?: string) => CommandResultTemplate[]

export interface Command {
    key: string // Unique command identification key
    prefixes?: string[] // Command prefixes, e.g. "go to". Prefix-less case is dynamic base command (e.g. Dashboard)
    resolver: CommandResolver | CommandResultTemplate[] // Resolver based on arguments (prefix excluded)
    scope: string
}

export type CommandRegistrations = {
    [commandKey: string]: Command
}

export type RegExpCommandPairs = [RegExp | null, Command][]

const RESULTS_MAX = 5

export const GLOBAL_COMMAND_SCOPE = 'global'

export const commandLogic = kea<commandLogicType<Command, CommandRegistrations>>({
    actions: {
        registerCommand: (command: Command) => ({ command }),
        deregisterCommand: (commandKey: string) => ({ commandKey }),
        setSearchInput: (input: string) => ({ input }),
    },
    reducers: {
        rawCommandRegistrations: [
            {} as CommandRegistrations,
            {
                registerCommand: (commands, { command }) => {
                    if (command.key in commands) throw Error(`Command key ${command.key} is already registered!`)
                    return { ...commands, [command.key]: command }
                },
                deregisterCommand: (commands, { commandKey }) => {
                    const cleanedCommands = { ...commands }
                    delete cleanedCommands[commandKey]
                    return cleanedCommands
                },
            },
        ],
        searchInput: [
            '',
            {
                setSearchInput: (_, { input }) => input,
            },
        ],
    },
    selectors: {
        commandRegistrations: [
            (s) => [s.rawCommandRegistrations, dashboardsModel.selectors.dashboards],
            (rawCommandRegistrations, dashboards) => ({
                ...rawCommandRegistrations,
                custom_dashboards: {
                    key: 'custom_dashboards',
                    prefixes: [],
                    resolver: dashboards.map((dashboard: DashboardType) => ({
                        key: `dashboard_${dashboard.id}`,
                        icon: LineChartOutlined,
                        display: `Go to Custom Dashboard ${dashboard.name}`,
                        executor: () => {
                            const { push } = router.actions
                            push(`/dashboard/${dashboard.id}`)
                        },
                    })),
                    scope: 'global',
                },
            }),
        ],
        regexpCommandPairs: [
            (selectors) => [selectors.commandRegistrations],
            (commandRegistrations: CommandRegistrations) => {
                const array: RegExpCommandPairs = []
                for (const command of Object.values(commandRegistrations)) {
                    if (command.prefixes)
                        array.push([new RegExp(`^\\s*(${command.prefixes.join('|')})(?:\\s+(.*)|$)`, 'i'), command])
                    else array.push([null, command])
                }
                return array
            },
        ],
        commandSearchResults: [
            (selectors) => [selectors.regexpCommandPairs, selectors.searchInput],
            (regexpCommandPairs: RegExpCommandPairs, argument: string) => {
                const directResults: CommandResult[] = []
                const prefixedResults: CommandResult[] = []
                for (const [regexp, command] of regexpCommandPairs) {
                    if (regexp) {
                        const match = argument.match(regexp)
                        if (match && match[1]) {
                            resolveCommand(command, prefixedResults, match[2], match[1])
                        }
                    }
                    resolveCommand(command, directResults, argument)
                }
                const fuse = new Fuse(directResults.concat(prefixedResults), {
                    keys: ['display', 'synonyms'],
                })
                return fuse
                    .search(argument)
                    .slice(0, RESULTS_MAX)
                    .map((result) => result.item)
            },
        ],
    },

    events: ({ actions }) => ({
        afterMount: () => {
            const { push } = router.actions
            const results: CommandResultTemplate[] = [
                {
                    key: 'dashboards',
                    icon: FundOutlined,
                    display: 'Go to Dashboards',
                    executor: () => {
                        push('/dashboard')
                    },
                },
                {
                    key: 'insights',
                    icon: RiseOutlined,
                    display: 'Go to Insights',
                    executor: () => {
                        push('/insights')
                    },
                },
                {
                    key: 'trends',
                    icon: RiseOutlined,
                    display: 'Go to Trends',
                    executor: () => {
                        // TODO: Fix me
                        push('/insights?insight=TRENDS')
                    },
                },
                {
                    key: 'sessions',
                    icon: ClockCircleOutlined,
                    display: 'Go to Sessions',
                    executor: () => {
                        // TODO: Fix me
                        push('/insights?insight=SESSIONS')
                    },
                },
                {
                    key: 'funnels',
                    icon: FunnelPlotOutlined,
                    display: 'Go to Funnels',
                    executor: () => {
                        // TODO: Fix me
                        push('/insights?insight=FUNNELS')
                    },
                },
                {
                    key: 'retention',
                    icon: GatewayOutlined,
                    display: 'Go to Retention',
                    executor: () => {
                        // TODO: Fix me
                        push('/insights?insight=RETENTION')
                    },
                },
                {
                    key: 'user_paths',
                    icon: InteractionOutlined,
                    display: 'Go to User Paths',
                    executor: () => {
                        // TODO: Fix me
                        push('/insights?insight=PATHS')
                    },
                },
                {
                    key: 'events',
                    icon: ContainerOutlined,
                    display: 'Go to Events',
                    executor: () => {
                        push('/events')
                    },
                },
                {
                    key: 'actions',
                    icon: AimOutlined,
                    display: 'Go to Actions',
                    executor: () => {
                        push('/actions')
                    },
                },
                {
                    key: 'actions/live',
                    icon: SyncOutlined,
                    display: 'Go to Live Actions',
                    executor: () => {
                        push('/actions/live')
                    },
                },
                {
                    key: 'sessions',
                    icon: ClockCircleOutlined,
                    display: 'Go to Live Sessions',
                    executor: () => {
                        push('/sessions')
                    },
                },
                {
                    key: 'people',
                    icon: UserOutlined,
                    display: 'Go to People',
                    synonyms: ['people'],
                    executor: () => {
                        push('/people')
                    },
                },
                {
                    key: 'cohorts',
                    icon: UsergroupAddOutlined,
                    display: 'Go to Cohorts',
                    executor: () => {
                        push('/people/cohorts')
                    },
                },
                {
                    key: 'experiments/feature_flags',
                    icon: ExperimentOutlined,
                    display: 'Go to Experiments',
                    synonyms: ['feature flags', 'a/b test'],
                    executor: () => {
                        push('/experiments/feature_flags')
                    },
                },
                {
                    key: 'setup',
                    icon: SettingOutlined,
                    display: 'Go to Setup',
                    synonyms: ['settings', 'configuration'],
                    executor: () => {
                        push('/setup')
                    },
                },
                {
                    key: 'annotations',
                    icon: MessageOutlined,
                    display: 'Go to Annotations',
                    executor: () => {
                        push('/annotations')
                    },
                },
                {
                    key: 'team',
                    icon: TeamOutlined,
                    display: 'Go to Team',
                    executor: () => {
                        push('/team')
                    },
                },
                {
                    key: 'docs',
                    icon: BookOutlined,
                    display: 'Go to Documentation',
                    synonyms: ['technical docs'],
                    executor: () => {
                        window.open('https://posthog.com/docs')
                    },
                },
                {
                    key: 'feedback',
                    icon: HeartOutlined,
                    display: 'Share Feedback',
                    synonyms: ['help', 'support'],
                    executor: () => {
                        window.open('mailto:hey@posthog.com?subject=PostHog%20feedback%20(command)')
                    },
                },
                {
                    key: 'action',
                    icon: PlusOutlined,
                    display: 'Create Action',
                    executor: () => {
                        push('/action')
                    },
                },
                {
                    key: 'logout',
                    icon: LogoutOutlined,
                    display: 'Log out',
                    executor: () => {
                        window.location.href = '/logout'
                    },
                },
            ]

            const globalCommands: Command[] = [
                {
                    key: GLOBAL_COMMAND_SCOPE,
                    prefixes: [],
                    resolver: results,
                    scope: GLOBAL_COMMAND_SCOPE,
                },
            ]
            for (const command of globalCommands) {
                actions.registerCommand(command)
            }
        },
        beforeUnmount: () => {
            actions.deregisterCommand(GLOBAL_COMMAND_SCOPE)
        },
    }),
})

function resolveCommand(
    command: Command,
    resultsArray: CommandResult[],
    argument?: string,
    prefixApplied?: string
): void {
    const results = Array.isArray(command.resolver) ? command.resolver : command.resolver(argument, prefixApplied)
    resultsArray.push(
        ...results.map((result) => {
            return { ...result, command } as CommandResult
        })
    )
}
