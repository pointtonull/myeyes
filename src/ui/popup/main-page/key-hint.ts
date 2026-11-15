import type {Command, ViewProps} from '../../../definitions';

/** " (Alt+Shift+T)" for a command's current shortcut, or '' when it is unbound. */
export function keyHint(props: ViewProps, command: Command): string {
    const key = props.data.shortcuts && props.data.shortcuts[command];
    return key ? ` (${key})` : '';
}
