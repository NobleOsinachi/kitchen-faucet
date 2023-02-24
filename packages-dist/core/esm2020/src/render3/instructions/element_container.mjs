/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { validateMatchingNode } from '../../hydration/error_handling';
import { CONTAINERS, NUM_ROOT_NODES, VIEWS } from '../../hydration/interfaces';
import { locateNextRNode, siblingAfter } from '../../hydration/node_lookup_utils';
import { isNodeDisconnected, markRNodeAsClaimedForHydration } from '../../hydration/utils';
import { locateDehydratedViewsInContainer } from '../../hydration/views';
import { assertDefined, assertEqual, assertIndexInRange } from '../../util/assert';
import { assertHasParent } from '../assert';
import { attachPatchData } from '../context_discovery';
import { registerPostOrderHooks } from '../hooks';
import { isContentQueryHost, isDirectiveHost } from '../interfaces/type_checks';
import { HEADER_OFFSET, HYDRATION_INFO, RENDERER } from '../interfaces/view';
import { assertTNodeType } from '../node_assert';
import { appendChild } from '../node_manipulation';
import { getBindingIndex, getCurrentTNode, getLView, getTView, isCurrentTNodeParent, isInSkipHydrationBlock, setCurrentTNode, setCurrentTNodeAsNotParent } from '../state';
import { computeStaticStyling } from '../styling/static_styling';
import { getConstant } from '../util/view_utils';
import { createDirectivesInstances, executeContentQueries, getOrCreateTNode, resolveDirectives, saveResolvedLocalsInData } from './shared';
function elementContainerStartFirstCreatePass(index, tView, lView, attrsIndex, localRefsIndex) {
    ngDevMode && ngDevMode.firstCreatePass++;
    const tViewConsts = tView.consts;
    const attrs = getConstant(tViewConsts, attrsIndex);
    const tNode = getOrCreateTNode(tView, index, 8 /* TNodeType.ElementContainer */, 'ng-container', attrs);
    // While ng-container doesn't necessarily support styling, we use the style context to identify
    // and execute directives on the ng-container.
    if (attrs !== null) {
        computeStaticStyling(tNode, attrs, true);
    }
    const localRefs = getConstant(tViewConsts, localRefsIndex);
    resolveDirectives(tView, lView, tNode, localRefs);
    if (tView.queries !== null) {
        tView.queries.elementStart(tView, tNode);
    }
    return tNode;
}
/**
 * Creates a logical container for other nodes (<ng-container>) backed by a comment node in the DOM.
 * The instruction must later be followed by `elementContainerEnd()` call.
 *
 * @param index Index of the element in the LView array
 * @param attrsIndex Index of the container attributes in the `consts` array.
 * @param localRefsIndex Index of the container's local references in the `consts` array.
 * @returns This function returns itself so that it may be chained.
 *
 * Even if this instruction accepts a set of attributes no actual attribute values are propagated to
 * the DOM (as a comment node can't have attributes). Attributes are here only for directive
 * matching purposes and setting initial inputs of directives.
 *
 * @codeGenApi
 */
export function ɵɵelementContainerStart(index, attrsIndex, localRefsIndex) {
    const lView = getLView();
    const tView = getTView();
    const adjustedIndex = index + HEADER_OFFSET;
    ngDevMode && assertIndexInRange(lView, adjustedIndex);
    ngDevMode &&
        assertEqual(getBindingIndex(), tView.bindingStartIndex, 'element containers should be created before any bindings');
    const tNode = tView.firstCreatePass ?
        elementContainerStartFirstCreatePass(adjustedIndex, tView, lView, attrsIndex, localRefsIndex) :
        tView.data[adjustedIndex];
    const [isNewlyCreatedNode, comment] = _locateOrCreateElementContainerNode(tView, lView, tNode, adjustedIndex);
    lView[adjustedIndex] = comment;
    setCurrentTNode(tNode, true);
    isNewlyCreatedNode && appendChild(tView, lView, comment, tNode);
    attachPatchData(comment, lView);
    if (isDirectiveHost(tNode)) {
        createDirectivesInstances(tView, lView, tNode);
        executeContentQueries(tView, tNode, lView);
    }
    if (localRefsIndex != null) {
        saveResolvedLocalsInData(lView, tNode);
    }
    return ɵɵelementContainerStart;
}
/**
 * Mark the end of the <ng-container>.
 * @returns This function returns itself so that it may be chained.
 *
 * @codeGenApi
 */
export function ɵɵelementContainerEnd() {
    let currentTNode = getCurrentTNode();
    const tView = getTView();
    if (isCurrentTNodeParent()) {
        setCurrentTNodeAsNotParent();
    }
    else {
        ngDevMode && assertHasParent(currentTNode);
        currentTNode = currentTNode.parent;
        setCurrentTNode(currentTNode, false);
    }
    ngDevMode && assertTNodeType(currentTNode, 8 /* TNodeType.ElementContainer */);
    if (tView.firstCreatePass) {
        registerPostOrderHooks(tView, currentTNode);
        if (isContentQueryHost(currentTNode)) {
            tView.queries.elementEnd(currentTNode);
        }
    }
    return ɵɵelementContainerEnd;
}
/**
 * Creates an empty logical container using {@link elementContainerStart}
 * and {@link elementContainerEnd}
 *
 * @param index Index of the element in the LView array
 * @param attrsIndex Index of the container attributes in the `consts` array.
 * @param localRefsIndex Index of the container's local references in the `consts` array.
 * @returns This function returns itself so that it may be chained.
 *
 * @codeGenApi
 */
export function ɵɵelementContainer(index, attrsIndex, localRefsIndex) {
    ɵɵelementContainerStart(index, attrsIndex, localRefsIndex);
    ɵɵelementContainerEnd();
    return ɵɵelementContainer;
}
let _locateOrCreateElementContainerNode = (tView, lView, tNode, adjustedIndex) => {
    const comment = lView[RENDERER].createComment(ngDevMode ? 'ng-container' : '');
    return [true, comment];
};
function locateOrCreateElementContainerNode(tView, lView, tNode, adjustedIndex) {
    let comment;
    const index = adjustedIndex - HEADER_OFFSET;
    const ngh = lView[HYDRATION_INFO];
    const isCreating = !ngh || isInSkipHydrationBlock() || isNodeDisconnected(ngh, index);
    if (isCreating) {
        ngDevMode && ngDevMode.rendererCreateComment++;
        comment = lView[RENDERER].createComment(ngDevMode ? 'ng-container' : '');
    }
    else {
        const nghContainer = ngh.data[CONTAINERS]?.[index];
        ngh.elementContainers ?? (ngh.elementContainers = {});
        ngDevMode &&
            assertDefined(nghContainer, 'There is no hydration info available for this element container');
        const currentRNode = locateNextRNode(ngh, tView, lView, tNode);
        if (nghContainer[VIEWS] && nghContainer[VIEWS].length > 0) {
            // This <ng-container> is also annotated as a view container.
            // Extract all dehydrated views following instructions from ngh
            // and store this info for later reuse in `createContainerRef`.
            const [anchorRNode, dehydratedViews] = locateDehydratedViewsInContainer(currentRNode, nghContainer);
            comment = anchorRNode;
            if (dehydratedViews.length > 0) {
                // Store dehydrated views info in ngh data structure for later reuse
                // while creating a ViewContainerRef instance, see `createContainerRef`.
                ngh.elementContainers[index] = { dehydratedViews };
            }
        }
        else {
            // This is a plain `<ng-container>`, which is *not* used
            // as the ViewContainerRef anchor, so we can rely on `numRootNodes`.
            //
            // Store a reference to the first node in a container,
            // so it can be referenced while invoking further instructions.
            ngh.elementContainers[index] = { firstChild: currentRNode };
            comment = siblingAfter(nghContainer[NUM_ROOT_NODES], currentRNode);
        }
        ngDevMode &&
            validateMatchingNode(comment, Node.COMMENT_NODE, null, lView, tNode);
        ngDevMode && markRNodeAsClaimedForHydration(comment);
    }
    return [isCreating, comment];
}
export function enableLocateOrCreateElementContainerNodeImpl() {
    _locateOrCreateElementContainerNode = locateOrCreateElementContainerNode;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlbWVudF9jb250YWluZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb3JlL3NyYy9yZW5kZXIzL2luc3RydWN0aW9ucy9lbGVtZW50X2NvbnRhaW5lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEVBQUMsb0JBQW9CLEVBQUMsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUMsTUFBTSw0QkFBNEIsQ0FBQztBQUM3RSxPQUFPLEVBQUMsZUFBZSxFQUFFLFlBQVksRUFBQyxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hGLE9BQU8sRUFBQyxrQkFBa0IsRUFBRSw4QkFBOEIsRUFBQyxNQUFNLHVCQUF1QixDQUFDO0FBQ3pGLE9BQU8sRUFBQyxnQ0FBZ0MsRUFBQyxNQUFNLHVCQUF1QixDQUFDO0FBQ3ZFLE9BQU8sRUFBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFDLE1BQU0sbUJBQW1CLENBQUM7QUFDakYsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLFdBQVcsQ0FBQztBQUMxQyxPQUFPLEVBQUMsZUFBZSxFQUFDLE1BQU0sc0JBQXNCLENBQUM7QUFDckQsT0FBTyxFQUFDLHNCQUFzQixFQUFDLE1BQU0sVUFBVSxDQUFDO0FBR2hELE9BQU8sRUFBQyxrQkFBa0IsRUFBRSxlQUFlLEVBQUMsTUFBTSwyQkFBMkIsQ0FBQztBQUM5RSxPQUFPLEVBQUMsYUFBYSxFQUFFLGNBQWMsRUFBUyxRQUFRLEVBQVEsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RixPQUFPLEVBQUMsZUFBZSxFQUFDLE1BQU0sZ0JBQWdCLENBQUM7QUFDL0MsT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLHNCQUFzQixDQUFDO0FBQ2pELE9BQU8sRUFBQyxlQUFlLEVBQUUsZUFBZSxFQUFFLFFBQVEsRUFBRSxR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aWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHt2YWxpZGF0ZU1hdGNoaW5nTm9kZX0gZnJvbSAnLi4vLi4vaHlkcmF0aW9uL2Vycm9yX2hhbmRsaW5nJztcbmltcG9ydCB7Q09OVEFJTkVSUywgTlVNX1JPT1RfTk9ERVMsIFZJRVdTfSBmcm9tICcuLi8uLi9oeWRyYXRpb24vaW50ZXJmYWNlcyc7XG5pbXBvcnQge2xvY2F0ZU5leHRSTm9kZSwgc2libGluZ0FmdGVyfSBmcm9tICcuLi8uLi9oeWRyYXRpb24vbm9kZV9sb29rdXBfdXRpbHMnO1xuaW1wb3J0IHtpc05vZGVEaXNjb25uZWN0ZWQsIG1hcmtSTm9kZUFzQ2xhaW1lZEZvckh5ZHJhdGlvbn0gZnJvbSAnLi4vLi4vaHlkcmF0aW9uL3V0aWxzJztcbmltcG9ydCB7bG9jYXRlRGVoeWRyYXRlZFZpZXdzSW5Db250YWluZXJ9IGZyb20gJy4uLy4uL2h5ZHJhdGlvbi92aWV3cyc7XG5pbXBvcnQge2Fzc2VydERlZmluZWQsIGFzc2VydEVxdWFsLCBhc3NlcnRJbmRleEluUmFuZ2V9IGZyb20gJy4uLy4uL3V0aWwvYXNzZXJ0JztcbmltcG9ydCB7YXNzZXJ0SGFzUGFyZW50fSBmcm9tICcuLi9hc3NlcnQnO1xuaW1wb3J0IHthdHRhY2hQYXRjaERhdGF9IGZyb20gJy4uL2NvbnRleHRfZGlzY292ZXJ5JztcbmltcG9ydCB7cmVnaXN0ZXJQb3N0T3JkZXJIb29rc30gZnJvbSAnLi4vaG9va3MnO1xuaW1wb3J0IHtUQXR0cmlidXRlcywgVEVsZW1lbnRDb250YWluZXJOb2RlLCBUTm9kZSwgVE5vZGVUeXBlfSBmcm9tICcuLi9pbnRlcmZhY2VzL25vZGUnO1xuaW1wb3J0IHtSQ29tbWVudH0gZnJvbSAnLi4vaW50ZXJmYWNlcy9yZW5kZXJlcl9kb20nO1xuaW1wb3J0IHtpc0NvbnRlbnRRdWVyeUhvc3QsIGlzRGlyZWN0aXZlSG9zdH0gZnJvbSAnLi4vaW50ZXJmYWNlcy90eXBlX2NoZWNrcyc7XG5pbXBvcnQge0hFQURFUl9PRkZTRVQsIEhZRFJBVElPTl9JTkZPLCBMVmlldywgUkVOREVSRVIsIFRWaWV3fSBmcm9tICcuLi9pbnRlcmZhY2VzL3ZpZXcnO1xuaW1wb3J0IHthc3NlcnRUTm9kZVR5cGV9IGZyb20gJy4uL25vZGVfYXNzZXJ0JztcbmltcG9ydCB7YXBwZW5kQ2hpbGR9IGZyb20gJy4uL25vZGVfbWFuaXB1bGF0aW9uJztcbmltcG9ydCB7Z2V0QmluZGluZ0luZGV4LCBnZXRDdXJyZW50VE5vZGUsIGdldExWaWV3LCBnZXRUVmlldywgaXNDdXJyZW50VE5vZGVQYXJlbnQsIGlzSW5Ta2lwSHlkcmF0aW9uQmxvY2ssIHNldEN1cnJlbnRUTm9kZSwgc2V0Q3VycmVudFROb2RlQXNOb3RQYXJlbnR9IGZyb20gJy4uL3N0YXRlJztcbmltcG9ydCB7Y29tcHV0ZVN0YXRpY1N0eWxpbmd9IGZyb20gJy4uL3N0eWxpbmcvc3RhdGljX3N0eWxpbmcnO1xuaW1wb3J0IHtnZXRDb25zdGFudH0gZnJvbSAnLi4vdXRpbC92aWV3X3V0aWxzJztcblxuaW1wb3J0IHtjcmVhdGVEaXJlY3RpdmVzSW5zdGFuY2VzLCBleGVjdXRlQ29udGVudFF1ZXJpZXMsIGdldE9yQ3JlYXRlVE5vZGUsIHJlc29sdmVEaXJlY3RpdmVzLCBzYXZlUmVzb2x2ZWRMb2NhbHNJbkRhdGF9IGZyb20gJy4vc2hhcmVkJztcblxuZnVuY3Rpb24gZWxlbWVudENvbnRhaW5lclN0YXJ0Rmlyc3RDcmVhdGVQYXNzKFxuICAgIGluZGV4OiBudW1iZXIsIHRWaWV3OiBUVmlldywgbFZpZXc6IExWaWV3LCBhdHRyc0luZGV4PzogbnVtYmVyfG51bGwsXG4gICAgbG9jYWxSZWZzSW5kZXg/OiBudW1iZXIpOiBURWxlbWVudENvbnRhaW5lck5vZGUge1xuICBuZ0Rldk1vZGUgJiYgbmdEZXZNb2RlLmZpcnN0Q3JlYXRlUGFzcysrO1xuXG4gIGNvbnN0IHRWaWV3Q29uc3RzID0gdFZpZXcuY29uc3RzO1xuICBjb25zdCBhdHRycyA9IGdldENvbnN0YW50PFRBdHRyaWJ1dGVzPih0Vmlld0NvbnN0cywgYXR0cnNJbmRleCk7XG4gIGNvbnN0IHROb2RlID0gZ2V0T3JDcmVhdGVUTm9kZSh0VmlldywgaW5kZXgsIFROb2RlVHlwZS5FbGVtZW50Q29udGFpbmVyLCAnbmctY29udGFpbmVyJywgYXR0cnMpO1xuXG4gIC8vIFdoaWxlIG5nLWNvbnRhaW5lciBkb2Vzbid0IG5lY2Vzc2FyaWx5IHN1cHBvcnQgc3R5bGluZywgd2UgdXNlIHRoZSBzdHlsZSBjb250ZXh0IHRvIGlkZW50aWZ5XG4gIC8vIGFuZCBleGVjdXRlIGRpcmVjdGl2ZXMgb24gdGhlIG5nLWNvbnRhaW5lci5cbiAgaWYgKGF0dHJzICE9PSBudWxsKSB7XG4gICAgY29tcHV0ZVN0YXRpY1N0eWxpbmcodE5vZGUsIGF0dHJzLCB0cnVlKTtcbiAgfVxuXG4gIGNvbnN0IGxvY2FsUmVmcyA9IGdldENvbnN0YW50PHN0cmluZ1tdPih0Vmlld0NvbnN0cywgbG9jYWxSZWZzSW5kZXgpO1xuICByZXNvbHZlRGlyZWN0aXZlcyh0VmlldywgbFZpZXcsIHROb2RlLCBsb2NhbFJlZnMpO1xuXG4gIGlmICh0Vmlldy5xdWVyaWVzICE9PSBudWxsKSB7XG4gICAgdFZpZXcucXVlcmllcy5lbGVtZW50U3RhcnQodFZpZXcsIHROb2RlKTtcbiAgfVxuXG4gIHJldHVybiB0Tm9kZTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbG9naWNhbCBjb250YWluZXIgZm9yIG90aGVyIG5vZGVzICg8bmctY29udGFpbmVyPikgYmFja2VkIGJ5IGEgY29tbWVudCBub2RlIGluIHRoZSBET00uXG4gKiBUaGUgaW5zdHJ1Y3Rpb24gbXVzdCBsYXRlciBiZSBmb2xsb3dlZCBieSBgZWxlbWVudENvbnRhaW5lckVuZCgpYCBjYWxsLlxuICpcbiAqIEBwYXJhbSBpbmRleCBJbmRleCBvZiB0aGUgZWxlbWVudCBpbiB0aGUgTFZpZXcgYXJyYXlcbiAqIEBwYXJhbSBhdHRyc0luZGV4IEluZGV4IG9mIHRoZSBjb250YWluZXIgYXR0cmlidXRlcyBpbiB0aGUgYGNvbnN0c2AgYXJyYXkuXG4gKiBAcGFyYW0gbG9jYWxSZWZzSW5kZXggSW5kZXggb2YgdGhlIGNvbnRhaW5lcidzIGxvY2FsIHJlZmVyZW5jZXMgaW4gdGhlIGBjb25zdHNgIGFycmF5LlxuICogQHJldHVybnMgVGhpcyBmdW5jdGlvbiByZXR1cm5zIGl0c2VsZiBzbyB0aGF0IGl0IG1heSBiZSBjaGFpbmVkLlxuICpcbiAqIEV2ZW4gaWYgdGhpcyBpbnN0cnVjdGlvbiBhY2NlcHRzIGEgc2V0IG9mIGF0dHJpYnV0ZXMgbm8gYWN0dWFsIGF0dHJpYnV0ZSB2YWx1ZXMgYXJlIHByb3BhZ2F0ZWQgdG9cbiAqIHRoZSBET00gKGFzIGEgY29tbWVudCBub2RlIGNhbid0IGhhdmUgYXR0cmlidXRlcykuIEF0dHJpYnV0ZXMgYXJlIGhlcmUgb25seSBmb3IgZGlyZWN0aXZlXG4gKiBtYXRjaGluZyBwdXJwb3NlcyBhbmQgc2V0dGluZyBpbml0aWFsIGlucHV0cyBvZiBkaXJlY3RpdmVzLlxuICpcbiAqIEBjb2RlR2VuQXBpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiDJtcm1ZWxlbWVudENvbnRhaW5lclN0YXJ0KFxuICAgIGluZGV4OiBudW1iZXIsIGF0dHJzSW5kZXg/OiBudW1iZXJ8bnVsbCxcbiAgICBsb2NhbFJlZnNJbmRleD86IG51bWJlcik6IHR5cGVvZiDJtcm1ZWxlbWVudENvbnRhaW5lclN0YXJ0IHtcbiAgY29uc3QgbFZpZXcgPSBnZXRMVmlldygpO1xuICBjb25zdCB0VmlldyA9IGdldFRWaWV3KCk7XG4gIGNvbnN0IGFkanVzdGVkSW5kZXggPSBpbmRleCArIEhFQURFUl9PRkZTRVQ7XG5cbiAgbmdEZXZNb2RlICYmIGFzc2VydEluZGV4SW5SYW5nZShsVmlldywgYWRqdXN0ZWRJbmRleCk7XG4gIG5nRGV2TW9kZSAmJlxuICAgICAgYXNzZXJ0RXF1YWwoXG4gICAgICAgICAgZ2V0QmluZGluZ0luZGV4KCksIHRWaWV3LmJpbmRpbmdTdGFydEluZGV4LFxuICAgICAgICAgICdlbGVtZW50IGNvbnRhaW5lcnMgc2hvdWxkIGJlIGNyZWF0ZWQgYmVmb3JlIGFueSBiaW5kaW5ncycpO1xuXG4gIGNvbnN0IHROb2RlID0gdFZpZXcuZmlyc3RDcmVhdGVQYXNzID9cbiAgICAgIGVsZW1lbnRDb250YWluZXJTdGFydEZpcnN0Q3JlYXRlUGFzcyhcbiAgICAgICAgICBhZGp1c3RlZEluZGV4LCB0VmlldywgbFZpZXcsIGF0dHJzSW5kZXgsIGxvY2FsUmVmc0luZGV4KSA6XG4gICAgICB0Vmlldy5kYXRhW2FkanVzdGVkSW5kZXhdIGFzIFRFbGVtZW50Q29udGFpbmVyTm9kZTtcblxuICBjb25zdCBbaXNOZXdseUNyZWF0ZWROb2RlLCBjb21tZW50XSA9XG4gICAgICBfbG9jYXRlT3JDcmVhdGVFbGVtZW50Q29udGFpbmVyTm9kZSh0VmlldywgbFZpZXcsIHROb2RlLCBhZGp1c3RlZEluZGV4KTtcbiAgbFZpZXdbYWRqdXN0ZWRJbmRleF0gPSBjb21tZW50O1xuXG4gIHNldEN1cnJlbnRUTm9kZSh0Tm9kZSwgdHJ1ZSk7XG5cbiAgaXNOZXdseUNyZWF0ZWROb2RlICYmIGFwcGVuZENoaWxkKHRWaWV3LCBsVmlldywgY29tbWVudCwgdE5vZGUpO1xuICBhdHRhY2hQYXRjaERhdGEoY29tbWVudCwgbFZpZXcpO1xuXG4gIGlmIChpc0RpcmVjdGl2ZUhvc3QodE5vZGUpKSB7XG4gICAgY3JlYXRlRGlyZWN0aXZlc0luc3RhbmNlcyh0VmlldywgbFZpZXcsIHROb2RlKTtcbiAgICBleGVjdXRlQ29udGVudFF1ZXJpZXModFZpZXcsIHROb2RlLCBsVmlldyk7XG4gIH1cblxuICBpZiAobG9jYWxSZWZzSW5kZXggIT0gbnVsbCkge1xuICAgIHNhdmVSZXNvbHZlZExvY2Fsc0luRGF0YShsVmlldywgdE5vZGUpO1xuICB9XG5cbiAgcmV0dXJuIMm1ybVlbGVtZW50Q29udGFpbmVyU3RhcnQ7XG59XG5cbi8qKlxuICogTWFyayB0aGUgZW5kIG9mIHRoZSA8bmctY29udGFpbmVyPi5cbiAqIEByZXR1cm5zIFRoaXMgZnVuY3Rpb24gcmV0dXJucyBpdHNlbGYgc28gdGhhdCBpdCBtYXkgYmUgY2hhaW5lZC5cbiAqXG4gKiBAY29kZUdlbkFwaVxuICovXG5leHBvcnQgZnVuY3Rpb24gybXJtWVsZW1lbnRDb250YWluZXJFbmQoKTogdHlwZW9mIMm1ybVlbGVtZW50Q29udGFpbmVyRW5kIHtcbiAgbGV0IGN1cnJlbnRUTm9kZSA9IGdldEN1cnJlbnRUTm9kZSgpITtcbiAgY29uc3QgdFZpZXcgPSBnZXRUVmlldygpO1xuICBpZiAoaXNDdXJyZW50VE5vZGVQYXJlbnQoKSkge1xuICAgIHNldEN1cnJlbnRUTm9kZUFzTm90UGFyZW50KCk7XG4gIH0gZWxzZSB7XG4gICAgbmdEZXZNb2RlICYmIGFzc2VydEhhc1BhcmVudChjdXJyZW50VE5vZGUpO1xuICAgIGN1cnJlbnRUTm9kZSA9IGN1cnJlbnRUTm9kZS5wYXJlbnQhO1xuICAgIHNldEN1cnJlbnRUTm9kZShjdXJyZW50VE5vZGUsIGZhbHNlKTtcbiAgfVxuXG4gIG5nRGV2TW9kZSAmJiBhc3NlcnRUTm9kZVR5cGUoY3VycmVudFROb2RlLCBUTm9kZVR5cGUuRWxlbWVudENvbnRhaW5lcik7XG5cbiAgaWYgKHRWaWV3LmZpcnN0Q3JlYXRlUGFzcykge1xuICAgIHJlZ2lzdGVyUG9zdE9yZGVySG9va3ModFZpZXcsIGN1cnJlbnRUTm9kZSk7XG4gICAgaWYgKGlzQ29udGVudFF1ZXJ5SG9zdChjdXJyZW50VE5vZGUpKSB7XG4gICAgICB0Vmlldy5xdWVyaWVzIS5lbGVtZW50RW5kKGN1cnJlbnRUTm9kZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiDJtcm1ZWxlbWVudENvbnRhaW5lckVuZDtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIGVtcHR5IGxvZ2ljYWwgY29udGFpbmVyIHVzaW5nIHtAbGluayBlbGVtZW50Q29udGFpbmVyU3RhcnR9XG4gKiBhbmQge0BsaW5rIGVsZW1lbnRDb250YWluZXJFbmR9XG4gKlxuICogQHBhcmFtIGluZGV4IEluZGV4IG9mIHRoZSBlbGVtZW50IGluIHRoZSBMVmlldyBhcnJheVxuICogQHBhcmFtIGF0dHJzSW5kZXggSW5kZXggb2YgdGhlIGNvbnRhaW5lciBhdHRyaWJ1dGVzIGluIHRoZSBgY29uc3RzYCBhcnJheS5cbiAqIEBwYXJhbSBsb2NhbFJlZnNJbmRleCBJbmRleCBvZiB0aGUgY29udGFpbmVyJ3MgbG9jYWwgcmVmZXJlbmNlcyBpbiB0aGUgYGNvbnN0c2AgYXJyYXkuXG4gKiBAcmV0dXJucyBUaGlzIGZ1bmN0aW9uIHJldHVybnMgaXRzZWxmIHNvIHRoYXQgaXQgbWF5IGJlIGNoYWluZWQuXG4gKlxuICogQGNvZGVHZW5BcGlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIMm1ybVlbGVtZW50Q29udGFpbmVyKFxuICAgIGluZGV4OiBudW1iZXIsIGF0dHJzSW5kZXg/OiBudW1iZXJ8bnVsbCwgbG9jYWxSZWZzSW5kZXg/OiBudW1iZXIpOiB0eXBlb2YgybXJtWVsZW1lbnRDb250YWluZXIge1xuICDJtcm1ZWxlbWVudENvbnRhaW5lclN0YXJ0KGluZGV4LCBhdHRyc0luZGV4LCBsb2NhbFJlZnNJbmRleCk7XG4gIMm1ybVlbGVtZW50Q29udGFpbmVyRW5kKCk7XG4gIHJldHVybiDJtcm1ZWxlbWVudENvbnRhaW5lcjtcbn1cblxubGV0IF9sb2NhdGVPckNyZWF0ZUVsZW1lbnRDb250YWluZXJOb2RlOiB0eXBlb2YgbG9jYXRlT3JDcmVhdGVFbGVtZW50Q29udGFpbmVyTm9kZSA9XG4gICAgKHRWaWV3OiBUVmlldywgbFZpZXc6IExWaWV3LCB0Tm9kZTogVE5vZGUsIGFkanVzdGVkSW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgY29uc3QgY29tbWVudCA9IGxWaWV3W1JFTkRFUkVSXS5jcmVhdGVDb21tZW50KG5nRGV2TW9kZSA/ICduZy1jb250YWluZXInIDogJycpO1xuICAgICAgcmV0dXJuIFt0cnVlLCBjb21tZW50XTtcbiAgICB9XG5cbmZ1bmN0aW9uIGxvY2F0ZU9yQ3JlYXRlRWxlbWVudENvbnRhaW5lck5vZGUoXG4gICAgdFZpZXc6IFRWaWV3LCBsVmlldzogTFZpZXcsIHROb2RlOiBUTm9kZSwgYWRqdXN0ZWRJbmRleDogbnVtYmVyKTogW2Jvb2xlYW4sIFJDb21tZW50XSB7XG4gIGxldCBjb21tZW50OiBSQ29tbWVudDtcbiAgY29uc3QgaW5kZXggPSBhZGp1c3RlZEluZGV4IC0gSEVBREVSX09GRlNFVDtcbiAgY29uc3QgbmdoID0gbFZpZXdbSFlEUkFUSU9OX0lORk9dO1xuICBjb25zdCBpc0NyZWF0aW5nID0gIW5naCB8fCBpc0luU2tpcEh5ZHJhdGlvbkJsb2NrKCkgfHwgaXNOb2RlRGlzY29ubmVjdGVkKG5naCwgaW5kZXgpO1xuICBpZiAoaXNDcmVhdGluZykge1xuICAgIG5nRGV2TW9kZSAmJiBuZ0Rldk1vZGUucmVuZGVyZXJDcmVhdGVDb21tZW50Kys7XG4gICAgY29tbWVudCA9IGxWaWV3W1JFTkRFUkVSXS5jcmVhdGVDb21tZW50KG5nRGV2TW9kZSA/ICduZy1jb250YWluZXInIDogJycpO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IG5naENvbnRhaW5lciA9IG5naC5kYXRhW0NPTlRBSU5FUlNdPy5baW5kZXhdITtcbiAgICBuZ2guZWxlbWVudENvbnRhaW5lcnMgPz89IHt9O1xuXG4gICAgbmdEZXZNb2RlICYmXG4gICAgICAgIGFzc2VydERlZmluZWQoXG4gICAgICAgICAgICBuZ2hDb250YWluZXIsICdUaGVyZSBpcyBubyBoeWRyYXRpb24gaW5mbyBhdmFpbGFibGUgZm9yIHRoaXMgZWxlbWVudCBjb250YWluZXInKTtcblxuICAgIGNvbnN0IGN1cnJlbnRSTm9kZSA9IGxvY2F0ZU5leHRSTm9kZShuZ2gsIHRWaWV3LCBsVmlldywgdE5vZGUpO1xuXG4gICAgaWYgKG5naENvbnRhaW5lcltWSUVXU10gJiYgbmdoQ29udGFpbmVyW1ZJRVdTXS5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBUaGlzIDxuZy1jb250YWluZXI+IGlzIGFsc28gYW5ub3RhdGVkIGFzIGEgdmlldyBjb250YWluZXIuXG4gICAgICAvLyBFeHRyYWN0IGFsbCBkZWh5ZHJhdGVkIHZpZXdzIGZvbGxvd2luZyBpbnN0cnVjdGlvbnMgZnJvbSBuZ2hcbiAgICAgIC8vIGFuZCBzdG9yZSB0aGlzIGluZm8gZm9yIGxhdGVyIHJldXNlIGluIGBjcmVhdGVDb250YWluZXJSZWZgLlxuICAgICAgY29uc3QgW2FuY2hvclJOb2RlLCBkZWh5ZHJhdGVkVmlld3NdID1cbiAgICAgICAgICBsb2NhdGVEZWh5ZHJhdGVkVmlld3NJbkNvbnRhaW5lcihjdXJyZW50Uk5vZGUhLCBuZ2hDb250YWluZXIpO1xuXG4gICAgICBjb21tZW50ID0gYW5jaG9yUk5vZGUgYXMgUkNvbW1lbnQ7XG5cbiAgICAgIGlmIChkZWh5ZHJhdGVkVmlld3MubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBTdG9yZSBkZWh5ZHJhdGVkIHZpZXdzIGluZm8gaW4gbmdoIGRhdGEgc3RydWN0dXJlIGZvciBsYXRlciByZXVzZVxuICAgICAgICAvLyB3aGlsZSBjcmVhdGluZyBhIFZpZXdDb250YWluZXJSZWYgaW5zdGFuY2UsIHNlZSBgY3JlYXRlQ29udGFpbmVyUmVmYC5cbiAgICAgICAgbmdoLmVsZW1lbnRDb250YWluZXJzW2luZGV4XSA9IHtkZWh5ZHJhdGVkVmlld3N9O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBUaGlzIGlzIGEgcGxhaW4gYDxuZy1jb250YWluZXI+YCwgd2hpY2ggaXMgKm5vdCogdXNlZFxuICAgICAgLy8gYXMgdGhlIFZpZXdDb250YWluZXJSZWYgYW5jaG9yLCBzbyB3ZSBjYW4gcmVseSBvbiBgbnVtUm9vdE5vZGVzYC5cbiAgICAgIC8vXG4gICAgICAvLyBTdG9yZSBhIHJlZmVyZW5jZSB0byB0aGUgZmlyc3Qgbm9kZSBpbiBhIGNvbnRhaW5lcixcbiAgICAgIC8vIHNvIGl0IGNhbiBiZSByZWZlcmVuY2VkIHdoaWxlIGludm9raW5nIGZ1cnRoZXIgaW5zdHJ1Y3Rpb25zLlxuICAgICAgbmdoLmVsZW1lbnRDb250YWluZXJzW2luZGV4XSA9IHtmaXJzdENoaWxkOiBjdXJyZW50Uk5vZGUgYXMgSFRNTEVsZW1lbnR9O1xuXG4gICAgICBjb21tZW50ID0gc2libGluZ0FmdGVyPFJDb21tZW50PihuZ2hDb250YWluZXJbTlVNX1JPT1RfTk9ERVNdISwgY3VycmVudFJOb2RlISkhO1xuICAgIH1cblxuICAgIG5nRGV2TW9kZSAmJlxuICAgICAgICB2YWxpZGF0ZU1hdGNoaW5nTm9kZShjb21tZW50IGFzIHVua25vd24gYXMgTm9kZSwgTm9kZS5DT01NRU5UX05PREUsIG51bGwsIGxWaWV3LCB0Tm9kZSk7XG4gICAgbmdEZXZNb2RlICYmIG1hcmtSTm9kZUFzQ2xhaW1lZEZvckh5ZHJhdGlvbihjb21tZW50KTtcbiAgfVxuICByZXR1cm4gW2lzQ3JlYXRpbmcsIGNvbW1lbnRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlTG9jYXRlT3JDcmVhdGVFbGVtZW50Q29udGFpbmVyTm9kZUltcGwoKSB7XG4gIF9sb2NhdGVPckNyZWF0ZUVsZW1lbnRDb250YWluZXJOb2RlID0gbG9jYXRlT3JDcmVhdGVFbGVtZW50Q29udGFpbmVyTm9kZTtcbn1cbiJdfQ==