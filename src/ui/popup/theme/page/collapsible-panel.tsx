import {m} from 'malevic';
import {getContext} from 'malevic/dom';

import {Glyph} from '../glyph';
import type {GlyphName} from '../glyph';

interface CollapsiblePanelStore {
    activeGroup: string | null;
}

// MyEyes! accordion: every group keeps its header; at most one is open, and
// clicking the open one closes it. Closed groups are not rendered, so their
// controls hold no state (sliders, dropdowns) while hidden.
function CollapsiblePanel({}, ...groups: Array<Malevic.ComponentSpec<CollapsibleGroupProps>>) {
    const context = getContext();
    const store: CollapsiblePanelStore = context.store;
    if (store.activeGroup === undefined) {
        store.activeGroup = groups[0].props.id;
    }
    return (
        <div class="collapsible-panel">
            {...groups.map((spec) => {
                const onToggle = () => {
                    store.activeGroup = store.activeGroup === spec.props.id ? null : spec.props.id;
                    context.refresh();
                };

                return {
                    ...spec,
                    props: {
                        ...spec.props,
                        open: store.activeGroup === spec.props.id,
                        onToggle,
                    },
                };
            })}
        </div>
    );
}

interface CollapsibleGroupProps {
    id: string;
    label: string;
    hint: string;
    icon: GlyphName;
    /** Colours shown at the right of the header (the Colors group's real colours). */
    swatches?: string[];
    open?: boolean;
    onToggle?: () => void;
}

function Group(props: CollapsibleGroupProps, content: Malevic.Child) {
    const bodyId = `collapsible-${props.id}`;
    return (
        <section
            class={{
                'collapsible-panel__group': true,
                'collapsible-panel__group--open': props.open,
            }}
        >
            <button
                class="collapsible-panel__head"
                aria-expanded={props.open ? 'true' : 'false'}
                aria-controls={bodyId}
                onclick={props.onToggle}
            >
                <Glyph name={props.open ? 'chevron-up' : 'chevron-down'} class="collapsible-panel__chevron" />
                <Glyph name={props.icon} class={`collapsible-panel__icon collapsible-panel__icon--${props.id}`} />
                <span class="collapsible-panel__text">
                    <span class="collapsible-panel__label">{props.label}</span>
                    <span class="collapsible-panel__hint">{props.hint}</span>
                </span>
                {props.swatches && props.swatches.length ? (
                    <span class="collapsible-panel__swatches" aria-hidden="true">
                        {props.swatches.map((color) => (
                            <span class="collapsible-panel__swatch" style={{'background-color': color}} />
                        ))}
                    </span>
                ) : null}
            </button>
            {props.open ? (
                <div class="collapsible-panel__body" id={bodyId}>
                    {content}
                </div>
            ) : null}
        </section>
    );
}

export default Object.assign(CollapsiblePanel, {Group});
