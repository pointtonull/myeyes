import {m} from 'malevic';
import {getContext} from 'malevic/dom';

export type DropDownOption<T> = {id: T; content: Malevic.Child};

interface DropDownProps<T> {
    class?: string;
    selected: T;
    options: Array<DropDownOption<T>>;
    onChange: (value: T) => void;
}

interface DropDownStore {
    isOpen: boolean;
    /** Keyboard highlight: an index into the list as drawn (selected option first). */
    activeIndex: number;
    listNode: HTMLElement;
    selectedNode: HTMLElement;
}

export default function DropDown<T>(props: DropDownProps<T>) {
    const context = getContext();
    const store: DropDownStore = context.store;

    if (context.prev) {
        const currOptions = props.options.map((o) => o.id);
        const prevOptions = (context.prev.props.options as Array<DropDownOption<T>>).map((o) => o.id);
        if (currOptions.length !== prevOptions.length || currOptions.some((o, i) => o !== prevOptions[i])) {
            store.isOpen = false;
        }
    }

    function saveListNode(el: Node) {
        store.listNode = el as HTMLElement;
    }

    function saveSelectedNode(el: Node) {
        store.selectedNode = el as HTMLElement;
    }

    function orderedOptions() {
        return props.options
            .slice()
            .sort((a, b) => a.id === props.selected ? -1 : b.id === props.selected ? 1 : 0);
    }

    function choose(value: DropDownOption<T>) {
        store.isOpen = false;
        context.refresh();
        props.onChange(value.id);
    }

    // MyEyes!: keyboard control. Enter/Space/arrows open the list; arrows move
    // the highlight, Enter/Space pick it, Escape (or Tab) closes without
    // picking. Escape is consumed while open so a page-level Escape (Back)
    // does not also fire.
    function onKeyDown(e: KeyboardEvent) {
        const options = orderedOptions();
        if (!store.isOpen) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                onSelectedClick();
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                store.activeIndex = Math.min(store.activeIndex + 1, options.length - 1);
                context.refresh();
                break;
            case 'ArrowUp':
                e.preventDefault();
                store.activeIndex = Math.max(store.activeIndex - 1, 0);
                context.refresh();
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                choose(options[store.activeIndex]);
                break;
            case 'Escape':
                e.preventDefault();
                store.isOpen = false;
                context.refresh();
                break;
            case 'Tab':
                store.isOpen = false;
                context.refresh();
                break;
        }
    }

    function onSelectedClick() {
        store.isOpen = !store.isOpen;
        store.activeIndex = 0;
        context.refresh();

        if (store.isOpen) {
            const onOuterClick = (e: MouseEvent) => {
                window.removeEventListener('mousedown', onOuterClick);

                const listRect = store.listNode.getBoundingClientRect();
                const ex = e.clientX;
                const ey = e.clientY;
                if (
                    ex < listRect.left ||
                    ex > listRect.right ||
                    ey < listRect.top ||
                    ey > listRect.bottom
                ) {
                    store.isOpen = false;
                    context.refresh();
                }
            };

            window.addEventListener('mousedown', onOuterClick, {passive: true});
        }
    }

    function createListItem(value: DropDownOption<T>, index: number) {
        return (
            <span
                class={{
                    'dropdown__list__item': true,
                    'dropdown__list__item--selected': value.id === props.selected,
                    'dropdown__list__item--active': store.isOpen && index === store.activeIndex,
                    [props.class!]: Boolean(props.class),
                }}
                onclick={() => choose(value)}
            >
                {value.content}
            </span>
        );
    }

    const selectedContent = props.options.find((value) => value.id === props.selected)!.content;

    return (
        <span
            class={{
                'dropdown': true,
                'dropdown--open': store.isOpen,
                [props.class!]: Boolean(props.class),
            }}
        >
            <span
                class="dropdown__list"
                oncreate={saveListNode}
            >
                {orderedOptions().map(createListItem)}
            </span>
            <span
                class="dropdown__selected"
                oncreate={saveSelectedNode}
                onclick={onSelectedClick}
                onkeydown={onKeyDown}
                role="combobox"
                tabindex="0"
                aria-haspopup="listbox"
                aria-expanded={store.isOpen ? 'true' : 'false'}
            >
                <span class="dropdown__selected__text">
                    {selectedContent}
                </span>
            </span>
        </span >
    );
}
