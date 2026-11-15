import {m} from 'malevic';

import type {Command, ViewProps} from '../../../definitions';
import {getLocalMessage} from '../../../utils/locales';
import {ControlGroup, Shortcut} from '../../controls';

// MyEyes!: all four keyboard commands are listed (and rebindable) here, not
// only upstream's toggle/addSite. The first two are bound by default; the
// others are one click away.
const HOTKEYS: Array<{command: Command; description: string}> = [
    {command: 'addSite', description: 'Toggle the current website (on / off, back to Auto)'},
    {command: 'cycleSiteTheme', description: 'Next theme for the current website'},
    {command: 'toggle', description: 'Enable/disable the extension on all sites'},
    {command: 'cycleDefaultTheme', description: 'Next default theme for new sites'},
];

export function HotkeysTab(props: ViewProps): Malevic.Child {
    const {data, actions} = props;
    return <div class="settings-tab">
        {HOTKEYS.map(({command, description}) => (
            <ControlGroup>
                <ControlGroup.Control>
                    <Shortcut
                        class="hotkeys__control"
                        commandName={command}
                        shortcuts={data.shortcuts}
                        textTemplate={(hotkey) => (hotkey
                            ? hotkey
                            : getLocalMessage('click_to_set_shortcut')
                        )}
                        onSetShortcut={(shortcut) => actions.setShortcut(command, shortcut)}
                    />
                </ControlGroup.Control>
                <ControlGroup.Description>
                    {description}
                </ControlGroup.Description>
            </ControlGroup>
        ))}
    </div>;
}
