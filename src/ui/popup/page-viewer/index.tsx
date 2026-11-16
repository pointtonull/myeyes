import {m} from 'malevic';

import {Button} from '../../controls';

interface PageProps {
    id: string;
    active?: boolean;
    first?: boolean;
    /** The content fills the page's height, so it can pin a footer and scroll the rest. */
    fill?: boolean;
    /** The page brings its own Back control (the header's arrow), so no bottom button. */
    noBack?: boolean;
    onBackButtonClick?: () => void;
}

export function Page(props: PageProps, content: Malevic.Spec) {
    return (
        <div class={{'page': true, 'page--active': props.active}}>
            <div class={{'page__content': true, 'page__content--fill': props.fill}}>
                {content}
            </div>
            {props.first || props.noBack ? null : (
                <Button class="page__back-button" onclick={props.onBackButtonClick}>
                    Back
                </Button>
            )}
        </div>
    );
}

interface PageViewerProps {
    activePage: string;
    onBackButtonClick: () => void;
}

export function PageViewer(
    props: PageViewerProps,
    ...pages: Array<Malevic.ComponentSpec<PageProps>>
) {
    return (
        <div class="page-viewer">
            {pages.map((pageSpec, i) => {
                return {
                    ...pageSpec,
                    props: {
                        ...pageSpec.props,
                        active: props.activePage === pageSpec.props.id,
                        first: i === 0,
                        onBackButtonClick: props.onBackButtonClick,
                    },
                } as Malevic.ComponentSpec<PageProps>;
            })}
        </div>
    );
}
