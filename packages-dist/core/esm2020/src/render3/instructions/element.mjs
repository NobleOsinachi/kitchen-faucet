/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { validateMatchingNode } from '../../hydration/error_handling';
import { locateNextRNode } from '../../hydration/node_lookup_utils';
import { hasNgSkipHydrationAttr } from '../../hydration/skip_hydration';
import { isNodeDisconnected, markRNodeAsClaimedForHydration } from '../../hydration/utils';
import { assertDefined, assertEqual, assertIndexInRange } from '../../util/assert';
import { assertFirstCreatePass, assertHasParent } from '../assert';
import { attachPatchData } from '../context_discovery';
import { registerPostOrderHooks } from '../hooks';
import { hasClassInput, hasStyleInput } from '../interfaces/node';
import { isContentQueryHost, isDirectiveHost } from '../interfaces/type_checks';
import { HEADER_OFFSET, HYDRATION_INFO, RENDERER } from '../interfaces/view';
import { assertTNodeType } from '../node_assert';
import { appendChild, createElementNode, setupStaticAttributes } from '../node_manipulation';
import { decreaseElementDepthCount, enterSkipHydrationBlock, getBindingIndex, getCurrentTNode, getElementDepthCount, getLView, getNamespace, getTView, increaseElementDepthCount, isCurrentTNodeParent, isInSkipHydrationBlock, isSkipHydrationRootTNode, leaveSkipHydrationBlock, setCurrentTNode, setCurrentTNodeAsNotParent } from '../state';
import { computeStaticStyling } from '../styling/static_styling';
import { getConstant } from '../util/view_utils';
import { validateElementIsKnown } from './element_validation';
import { setDirectiveInputsWhichShadowsStyling } from './property';
import { createDirectivesInstances, executeContentQueries, getOrCreateTNode, resolveDirectives, saveResolvedLocalsInData } from './shared';
function elementStartFirstCreatePass(index, tView, lView, name, attrsIndex, localRefsIndex) {
    ngDevMode && assertFirstCreatePass(tView);
    ngDevMode && ngDevMode.firstCreatePass++;
    const tViewConsts = tView.consts;
    const attrs = getConstant(tViewConsts, attrsIndex);
    const tNode = getOrCreateTNode(tView, index, 2 /* TNodeType.Element */, name, attrs);
    resolveDirectives(tView, lView, tNode, getConstant(tViewConsts, localRefsIndex));
    if (tNode.attrs !== null) {
        computeStaticStyling(tNode, tNode.attrs, false);
    }
    if (tNode.mergedAttrs !== null) {
        computeStaticStyling(tNode, tNode.mergedAttrs, true);
    }
    if (tView.queries !== null) {
        tView.queries.elementStart(tView, tNode);
    }
    return tNode;
}
/**
 * Create DOM element. The instruction must later be followed by `elementEnd()` call.
 *
 * @param index Index of the element in the LView array
 * @param name Name of the DOM Node
 * @param attrsIndex Index of the element's attributes in the `consts` array.
 * @param localRefsIndex Index of the element's local references in the `consts` array.
 * @returns This function returns itself so that it may be chained.
 *
 * Attributes and localRefs are passed as an array of strings where elements with an even index
 * hold an attribute name and elements with an odd index hold an attribute value, ex.:
 * ['id', 'warning5', 'class', 'alert']
 *
 * @codeGenApi
 */
export function ɵɵelementStart(index, name, attrsIndex, localRefsIndex) {
    const lView = getLView();
    const tView = getTView();
    const adjustedIndex = HEADER_OFFSET + index;
    ngDevMode &&
        assertEqual(getBindingIndex(), tView.bindingStartIndex, 'elements should be created before any bindings');
    ngDevMode && assertIndexInRange(lView, adjustedIndex);
    const renderer = lView[RENDERER];
    const tNode = tView.firstCreatePass ?
        elementStartFirstCreatePass(adjustedIndex, tView, lView, name, attrsIndex, localRefsIndex) :
        tView.data[adjustedIndex];
    const [isNewlyCreatedNode, native] = _locateOrCreateElementNode(tView, lView, tNode, renderer, adjustedIndex, name);
    lView[adjustedIndex] = native;
    const hasDirectives = isDirectiveHost(tNode);
    if (ngDevMode && tView.firstCreatePass) {
        validateElementIsKnown(native, lView, tNode.value, tView.schemas, hasDirectives);
    }
    setCurrentTNode(tNode, true);
    setupStaticAttributes(renderer, native, tNode);
    if ((tNode.flags & 32 /* TNodeFlags.isDetached */) !== 32 /* TNodeFlags.isDetached */ && isNewlyCreatedNode) {
        // In the i18n case, the translation may have removed this element, so only add it if it is not
        // detached. See `TNodeType.Placeholder` and `LFrame.inI18n` for more context.
        appendChild(tView, lView, native, tNode);
    }
    // any immediate children of a component or template container must be pre-emptively
    // monkey-patched with the component view data so that the element can be inspected
    // later on using any element discovery utility methods (see `element_discovery.ts`)
    if (getElementDepthCount() === 0) {
        attachPatchData(native, lView);
    }
    increaseElementDepthCount();
    if (hasDirectives) {
        createDirectivesInstances(tView, lView, tNode);
        executeContentQueries(tView, tNode, lView);
    }
    if (localRefsIndex !== null) {
        saveResolvedLocalsInData(lView, tNode);
    }
    return ɵɵelementStart;
}
/**
 * Mark the end of the element.
 * @returns This function returns itself so that it may be chained.
 *
 * @codeGenApi
 */
export function ɵɵelementEnd() {
    let currentTNode = getCurrentTNode();
    ngDevMode && assertDefined(currentTNode, 'No parent node to close.');
    if (isCurrentTNodeParent()) {
        setCurrentTNodeAsNotParent();
    }
    else {
        ngDevMode && assertHasParent(getCurrentTNode());
        currentTNode = currentTNode.parent;
        setCurrentTNode(currentTNode, false);
    }
    const tNode = currentTNode;
    ngDevMode && assertTNodeType(tNode, 3 /* TNodeType.AnyRNode */);
    if (isSkipHydrationRootTNode(tNode)) {
        leaveSkipHydrationBlock();
    }
    decreaseElementDepthCount();
    const tView = getTView();
    if (tView.firstCreatePass) {
        registerPostOrderHooks(tView, currentTNode);
        if (isContentQueryHost(currentTNode)) {
            tView.queries.elementEnd(currentTNode);
        }
    }
    if (tNode.classesWithoutHost != null && hasClassInput(tNode)) {
        setDirectiveInputsWhichShadowsStyling(tView, tNode, getLView(), tNode.classesWithoutHost, true);
    }
    if (tNode.stylesWithoutHost != null && hasStyleInput(tNode)) {
        setDirectiveInputsWhichShadowsStyling(tView, tNode, getLView(), tNode.stylesWithoutHost, false);
    }
    return ɵɵelementEnd;
}
/**
 * Creates an empty element using {@link elementStart} and {@link elementEnd}
 *
 * @param index Index of the element in the data array
 * @param name Name of the DOM Node
 * @param attrsIndex Index of the element's attributes in the `consts` array.
 * @param localRefsIndex Index of the element's local references in the `consts` array.
 * @returns This function returns itself so that it may be chained.
 *
 * @codeGenApi
 */
export function ɵɵelement(index, name, attrsIndex, localRefsIndex) {
    ɵɵelementStart(index, name, attrsIndex, localRefsIndex);
    ɵɵelementEnd();
    return ɵɵelement;
}
let _locateOrCreateElementNode = (tView, lView, tNode, renderer, adjustedIndex, name) => {
    return [true, createElementNode(renderer, name, getNamespace())];
};
function locateOrCreateElementNodeImpl(tView, lView, tNode, renderer, adjustedIndex, name) {
    const ngh = lView[HYDRATION_INFO];
    const index = adjustedIndex - HEADER_OFFSET;
    const isCreating = !ngh || isInSkipHydrationBlock() || isNodeDisconnected(ngh, index);
    let native;
    if (isCreating) {
        native = createElementNode(renderer, name, getNamespace());
    }
    else {
        // hydrating
        native = locateNextRNode(ngh, tView, lView, tNode);
        ngDevMode &&
            validateMatchingNode(native, Node.ELEMENT_NODE, name, lView, tNode);
        ngDevMode && markRNodeAsClaimedForHydration(native);
    }
    if (ngh && hasNgSkipHydrationAttr(tNode)) {
        enterSkipHydrationBlock(tNode);
        // Since this isn't hydratable, we need to empty the node
        // so there's no duplicate content after render
        while (native.firstChild) {
            native.removeChild(native.firstChild);
        }
    }
    return [isCreating, native];
}
export function enableLocateOrCreateElementNodeImpl() {
    _locateOrCreateElementNode = locateOrCreateElementNodeImpl;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlbWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvcmUvc3JjL3JlbmRlcjMvaW5zdHJ1Y3Rpb25zL2VsZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxFQUFDLG9CQUFvQixFQUFDLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLG1DQUFtQyxDQUFDO0FBQ2xFLE9BQU8sRUFBQyxzQkFBc0IsRUFBQyxNQUFNLGdDQUFnQyxDQUFDO0FBQ3RFLE9BQU8sRUFBQyxrQkFBa0IsRUFBRSw4QkFBOEIsRUFBQyxNQUFNLHVCQUF1QixDQUFDO0FBQ3pGLE9BQU8sRUFBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFDLE1BQU0sbUJBQW1CLENBQUM7QUFDakYsT0FBTyxFQUFDLHFCQUFxQixFQUFFLGVBQWUsRUFBQyxNQUFNLFdBQVcsQ0FBQztBQUNqRSxPQUFPLEVBQUMsZUFBZSxFQUFDLE1BQU0sc0JBQXNCLENBQUM7QUFDckQsT0FBTyxFQUFDLHNCQUFzQixFQUFDLE1BQU0sVUFBVSxDQUFDO0FBQ2hELE9BQU8sRUFBQyxhQUFhLEVBQUUsYUFBYSxFQUEwRCxNQUFNLG9CQUFvQixDQUFDO0FBR3pILE9BQU8sRUFBQyxrQkFBa0IsRUFBRSxlQUFlLEVBQUMsTUFBTSwyQkFBMkIsQ0FBQztBQUM5RSxPQUFPLEVBQUMsYUFBYSxFQUFFLGNBQWMsRUFBUyxRQUFRLEVBQVEsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RixPQUFPLEVBQUMsZUFBZSxFQUFDLE1BQU0sZ0JBQWdCLENBQUM7QUFDL0MsT0FBTyxFQUFDLFdBQVcsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBQyxNQUFNLHNCQUFzQixDQUFDO0FBQzNGLE9BQU8sRUFBQyx5QkFBeUIsRUFBRSx1QkFBdUIsRUFBRSxlQUFlLEVBQUUs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QixDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztLQUM1RDtTQUFNO1FBQ0wsWUFBWTtRQUNaLE1BQU0sR0FBRyxlQUFlLENBQVcsR0FBRyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFFLENBQUM7UUFDOUQsU0FBUztZQUNMLG9CQUFvQixDQUFDLE1BQXlCLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNGLFNBQVMsSUFBSSw4QkFBOEIsQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUNyRDtJQUNELElBQUksR0FBRyxJQUFJLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ3hDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRS9CLHlEQUF5RDtRQUN6RCwrQ0FBK0M7UUFDL0MsT0FBUSxNQUFzQixDQUFDLFVBQVUsRUFBRTtZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFFLE1BQXNCLENBQUMsVUFBVyxDQUFDLENBQUM7U0FDekQ7S0FDRjtJQUNELE9BQU8sQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDOUIsQ0FBQztBQUVELE1BQU0sVUFBVSxtQ0FBbUM7SUFDakQsMEJBQTBCLEdBQUcsNkJBQTZCLENBQUM7QUFDN0QsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge3ZhbGlkYXRlTWF0Y2hpbmdOb2RlfSBmcm9tICcuLi8uLi9oeWRyYXRpb24vZXJyb3JfaGFuZGxpbmcnO1xuaW1wb3J0IHtsb2NhdGVOZXh0Uk5vZGV9IGZyb20gJy4uLy4uL2h5ZHJhdGlvbi9ub2RlX2xvb2t1cF91dGlscyc7XG5pbXBvcnQge2hhc05nU2tpcEh5ZHJhdGlvbkF0dHJ9IGZyb20gJy4uLy4uL2h5ZHJhdGlvbi9za2lwX2h5ZHJhdGlvbic7XG5pbXBvcnQge2lzTm9kZURpc2Nvbm5lY3RlZCwgbWFya1JOb2RlQXNDbGFpbWVkRm9ySHlkcmF0aW9ufSBmcm9tICcuLi8uLi9oeWRyYXRpb24vdXRpbHMnO1xuaW1wb3J0IHthc3NlcnREZWZpbmVkLCBhc3NlcnRFcXVhbCwgYXNzZXJ0SW5kZXhJblJhbmdlfSBmcm9tICcuLi8uLi91dGlsL2Fzc2VydCc7XG5pbXBvcnQge2Fzc2VydEZpcnN0Q3JlYXRlUGFzcywgYXNzZXJ0SGFzUGFyZW50fSBmcm9tICcuLi9hc3NlcnQnO1xuaW1wb3J0IHthdHRhY2hQYXRjaERhdGF9IGZyb20gJy4uL2NvbnRleHRfZGlzY292ZXJ5JztcbmltcG9ydCB7cmVnaXN0ZXJQb3N0T3JkZXJIb29rc30gZnJvbSAnLi4vaG9va3MnO1xuaW1wb3J0IHtoYXNDbGFzc0lucHV0LCBoYXNTdHlsZUlucHV0LCBUQXR0cmlidXRlcywgVEVsZW1lbnROb2RlLCBUTm9kZSwgVE5vZGVGbGFncywgVE5vZGVUeXBlfSBmcm9tICcuLi9pbnRlcmZhY2VzL25vZGUnO1xuaW1wb3J0IHtSZW5kZXJlcn0gZnJvbSAnLi4vaW50ZXJmYWNlcy9yZW5kZXJlcic7XG5pbXBvcnQge1JFbGVtZW50fSBmcm9tICcuLi9pbnRlcmZhY2VzL3JlbmRlcmVyX2RvbSc7XG5pbXBvcnQge2lzQ29udGVudFF1ZXJ5SG9zdCwgaXNEaXJlY3RpdmVIb3N0fSBmcm9tICcuLi9pbnRlcmZhY2VzL3R5cGVfY2hlY2tzJztcbmltcG9ydCB7SEVBREVSX09GRlNFVCwgSFlEUkFUSU9OX0lORk8sIExWaWV3LCBSRU5ERVJFUiwgVFZpZXd9IGZyb20gJy4uL2ludGVyZmFjZXMvdmlldyc7XG5pbXBvcnQge2Fzc2VydFROb2RlVHlwZX0gZnJvbSAnLi4vbm9kZV9hc3NlcnQnO1xuaW1wb3J0IHthcHBlbmRDaGlsZCwgY3JlYXRlRWxlbWVudE5vZGUsIHNldHVwU3RhdGljQXR0cmlidXRlc30gZnJvbSAnLi4vbm9kZV9tYW5pcHVsYXRpb24nO1xuaW1wb3J0IHtkZWNyZWFzZUVsZW1lbnREZXB0aENvdW50LCBlbnRlclNraXBIeWRyYXRpb25CbG9jaywgZ2V0QmluZGluZ0luZGV4LCBnZXRDdXJyZW50VE5vZGUsIGdldEVsZW1lbnREZXB0aENvdW50LCBnZXRMVmlldywgZ2V0TmFtZXNwYWNlLCBnZXRUVmlldywgaW5jcmVhc2VFbGVtZW50RGVwdGhDb3VudCwgaXNDdXJyZW50VE5vZGVQYXJlbnQsIGlzSW5Ta2lwSHlkcmF0aW9uQmxvY2ssIGlzU2tpcEh5ZHJhdGlvblJvb3RUTm9kZSwgbGVhdmVTa2lwSHlkcmF0aW9uQmxvY2ssIHNldEN1cnJlbnRUTm9kZSwgc2V0Q3VycmVudFROb2RlQXNOb3RQYXJlbnR9IGZyb20gJy4uL3N0YXRlJztcbmltcG9ydCB7Y29tcHV0ZVN0YXRpY1N0eWxpbmd9IGZyb20gJy4uL3N0eWxpbmcvc3RhdGljX3N0eWxpbmcnO1xuaW1wb3J0IHtnZXRDb25zdGFudH0gZnJvbSAnLi4vdXRpbC92aWV3X3V0aWxzJztcblxuaW1wb3J0IHt2YWxpZGF0ZUVsZW1lbnRJc0tub3dufSBmcm9tICcuL2VsZW1lbnRfdmFsaWRhdGlvbic7XG5pbXBvcnQge3NldERpcmVjdGl2ZUlucHV0c1doaWNoU2hhZG93c1N0eWxpbmd9IGZyb20gJy4vcHJvcGVydHknO1xuaW1wb3J0IHtjcmVhdGVEaXJlY3RpdmVzSW5zdGFuY2VzLCBleGVjdXRlQ29udGVudFF1ZXJpZXMsIGdldE9yQ3JlYXRlVE5vZGUsIHJlc29sdmVEaXJlY3RpdmVzLCBzYXZlUmVzb2x2ZWRMb2NhbHNJbkRhdGF9IGZyb20gJy4vc2hhcmVkJztcblxuXG5mdW5jdGlvbiBlbGVtZW50U3RhcnRGaXJzdENyZWF0ZVBhc3MoXG4gICAgaW5kZXg6IG51bWJlciwgdFZpZXc6IFRWaWV3LCBsVmlldzogTFZpZXcsIG5hbWU6IHN0cmluZywgYXR0cnNJbmRleD86IG51bWJlcnxudWxsLFxuICAgIGxvY2FsUmVmc0luZGV4PzogbnVtYmVyKTogVEVsZW1lbnROb2RlIHtcbiAgbmdEZXZNb2RlICYmIGFzc2VydEZpcnN0Q3JlYXRlUGFzcyh0Vmlldyk7XG4gIG5nRGV2TW9kZSAmJiBuZ0Rldk1vZGUuZmlyc3RDcmVhdGVQYXNzKys7XG5cbiAgY29uc3QgdFZpZXdDb25zdHMgPSB0Vmlldy5jb25zdHM7XG4gIGNvbnN0IGF0dHJzID0gZ2V0Q29uc3RhbnQ8VEF0dHJpYnV0ZXM+KHRWaWV3Q29uc3RzLCBhdHRyc0luZGV4KTtcbiAgY29uc3QgdE5vZGUgPSBnZXRPckNyZWF0ZVROb2RlKHRWaWV3LCBpbmRleCwgVE5vZGVUeXBlLkVsZW1lbnQsIG5hbWUsIGF0dHJzKTtcblxuICByZXNvbHZlRGlyZWN0aXZlcyh0VmlldywgbFZpZXcsIHROb2RlLCBnZXRDb25zdGFudDxzdHJpbmdbXT4odFZpZXdDb25zdHMsIGxvY2FsUmVmc0luZGV4KSk7XG5cbiAgaWYgKHROb2RlLmF0dHJzICE9PSBudWxsKSB7XG4gICAgY29tcHV0ZVN0YXRpY1N0eWxpbmcodE5vZGUsIHROb2RlLmF0dHJzLCBmYWxzZSk7XG4gIH1cblxuICBpZiAodE5vZGUubWVyZ2VkQXR0cnMgIT09IG51bGwpIHtcbiAgICBjb21wdXRlU3RhdGljU3R5bGluZyh0Tm9kZSwgdE5vZGUubWVyZ2VkQXR0cnMsIHRydWUpO1xuICB9XG5cbiAgaWYgKHRWaWV3LnF1ZXJpZXMgIT09IG51bGwpIHtcbiAgICB0Vmlldy5xdWVyaWVzLmVsZW1lbnRTdGFydCh0VmlldywgdE5vZGUpO1xuICB9XG5cbiAgcmV0dXJuIHROb2RlO1xufVxuXG4vKipcbiAqIENyZWF0ZSBET00gZWxlbWVudC4gVGhlIGluc3RydWN0aW9uIG11c3QgbGF0ZXIgYmUgZm9sbG93ZWQgYnkgYGVsZW1lbnRFbmQoKWAgY2FsbC5cbiAqXG4gKiBAcGFyYW0gaW5kZXggSW5kZXggb2YgdGhlIGVsZW1lbnQgaW4gdGhlIExWaWV3IGFycmF5XG4gKiBAcGFyYW0gbmFtZSBOYW1lIG9mIHRoZSBET00gTm9kZVxuICogQHBhcmFtIGF0dHJzSW5kZXggSW5kZXggb2YgdGhlIGVsZW1lbnQncyBhdHRyaWJ1dGVzIGluIHRoZSBgY29uc3RzYCBhcnJheS5cbiAqIEBwYXJhbSBsb2NhbFJlZnNJbmRleCBJbmRleCBvZiB0aGUgZWxlbWVudCdzIGxvY2FsIHJlZmVyZW5jZXMgaW4gdGhlIGBjb25zdHNgIGFycmF5LlxuICogQHJldHVybnMgVGhpcyBmdW5jdGlvbiByZXR1cm5zIGl0c2VsZiBzbyB0aGF0IGl0IG1heSBiZSBjaGFpbmVkLlxuICpcbiAqIEF0dHJpYnV0ZXMgYW5kIGxvY2FsUmVmcyBhcmUgcGFzc2VkIGFzIGFuIGFycmF5IG9mIHN0cmluZ3Mgd2hlcmUgZWxlbWVudHMgd2l0aCBhbiBldmVuIGluZGV4XG4gKiBob2xkIGFuIGF0dHJpYnV0ZSBuYW1lIGFuZCBlbGVtZW50cyB3aXRoIGFuIG9kZCBpbmRleCBob2xkIGFuIGF0dHJpYnV0ZSB2YWx1ZSwgZXguOlxuICogWydpZCcsICd3YXJuaW5nNScsICdjbGFzcycsICdhbGVydCddXG4gKlxuICogQGNvZGVHZW5BcGlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIMm1ybVlbGVtZW50U3RhcnQoXG4gICAgaW5kZXg6IG51bWJlciwgbmFtZTogc3RyaW5nLCBhdHRyc0luZGV4PzogbnVtYmVyfG51bGwsXG4gICAgbG9jYWxSZWZzSW5kZXg/OiBudW1iZXIpOiB0eXBlb2YgybXJtWVsZW1lbnRTdGFydCB7XG4gIGNvbnN0IGxWaWV3ID0gZ2V0TFZpZXcoKTtcbiAgY29uc3QgdFZpZXcgPSBnZXRUVmlldygpO1xuICBjb25zdCBhZGp1c3RlZEluZGV4ID0gSEVBREVSX09GRlNFVCArIGluZGV4O1xuXG4gIG5nRGV2TW9kZSAmJlxuICAgICAgYXNzZXJ0RXF1YWwoXG4gICAgICAgICAgZ2V0QmluZGluZ0luZGV4KCksIHRWaWV3LmJpbmRpbmdTdGFydEluZGV4LFxuICAgICAgICAgICdlbGVtZW50cyBzaG91bGQgYmUgY3JlYXRlZCBiZWZvcmUgYW55IGJpbmRpbmdzJyk7XG4gIG5nRGV2TW9kZSAmJiBhc3NlcnRJbmRleEluUmFuZ2UobFZpZXcsIGFkanVzdGVkSW5kZXgpO1xuXG4gIGNvbnN0IHJlbmRlcmVyID0gbFZpZXdbUkVOREVSRVJdO1xuXG4gIGNvbnN0IHROb2RlID0gdFZpZXcuZmlyc3RDcmVhdGVQYXNzID9cbiAgICAgIGVsZW1lbnRTdGFydEZpcnN0Q3JlYXRlUGFzcyhhZGp1c3RlZEluZGV4LCB0VmlldywgbFZpZXcsIG5hbWUsIGF0dHJzSW5kZXgsIGxvY2FsUmVmc0luZGV4KSA6XG4gICAgICB0Vmlldy5kYXRhW2FkanVzdGVkSW5kZXhdIGFzIFRFbGVtZW50Tm9kZTtcblxuICBjb25zdCBbaXNOZXdseUNyZWF0ZWROb2RlLCBuYXRpdmVdID1cbiAgICAgIF9sb2NhdGVPckNyZWF0ZUVsZW1lbnROb2RlKHRWaWV3LCBsVmlldywgdE5vZGUsIHJlbmRlcmVyLCBhZGp1c3RlZEluZGV4LCBuYW1lKTtcbiAgbFZpZXdbYWRqdXN0ZWRJbmRleF0gPSBuYXRpdmU7XG5cbiAgY29uc3QgaGFzRGlyZWN0aXZlcyA9IGlzRGlyZWN0aXZlSG9zdCh0Tm9kZSk7XG5cbiAgaWYgKG5nRGV2TW9kZSAmJiB0Vmlldy5maXJzdENyZWF0ZVBhc3MpIHtcbiAgICB2YWxpZGF0ZUVsZW1lbnRJc0tub3duKG5hdGl2ZSwgbFZpZXcsIHROb2RlLnZhbHVlLCB0Vmlldy5zY2hlbWFzLCBoYXNEaXJlY3RpdmVzKTtcbiAgfVxuXG4gIHNldEN1cnJlbnRUTm9kZSh0Tm9kZSwgdHJ1ZSk7XG4gIHNldHVwU3RhdGljQXR0cmlidXRlcyhyZW5kZXJlciwgbmF0aXZlLCB0Tm9kZSk7XG5cbiAgaWYgKCh0Tm9kZS5mbGFncyAmIFROb2RlRmxhZ3MuaXNEZXRhY2hlZCkgIT09IFROb2RlRmxhZ3MuaXNEZXRhY2hlZCAmJiBpc05ld2x5Q3JlYXRlZE5vZGUpIHtcbiAgICAvLyBJbiB0aGUgaTE4biBjYXNlLCB0aGUgdHJhbnNsYXRpb24gbWF5IGhhdmUgcmVtb3ZlZCB0aGlzIGVsZW1lbnQsIHNvIG9ubHkgYWRkIGl0IGlmIGl0IGlzIG5vdFxuICAgIC8vIGRldGFjaGVkLiBTZWUgYFROb2RlVHlwZS5QbGFjZWhvbGRlcmAgYW5kIGBMRnJhbWUuaW5JMThuYCBmb3IgbW9yZSBjb250ZXh0LlxuICAgIGFwcGVuZENoaWxkKHRWaWV3LCBsVmlldywgbmF0aXZlLCB0Tm9kZSk7XG4gIH1cblxuICAvLyBhbnkgaW1tZWRpYXRlIGNoaWxkcmVuIG9mIGEgY29tcG9uZW50IG9yIHRlbXBsYXRlIGNvbnRhaW5lciBtdXN0IGJlIHByZS1lbXB0aXZlbHlcbiAgLy8gbW9ua2V5LXBhdGNoZWQgd2l0aCB0aGUgY29tcG9uZW50IHZpZXcgZGF0YSBzbyB0aGF0IHRoZSBlbGVtZW50IGNhbiBiZSBpbnNwZWN0ZWRcbiAgLy8gbGF0ZXIgb24gdXNpbmcgYW55IGVsZW1lbnQgZGlzY292ZXJ5IHV0aWxpdHkgbWV0aG9kcyAoc2VlIGBlbGVtZW50X2Rpc2NvdmVyeS50c2ApXG4gIGlmIChnZXRFbGVtZW50RGVwdGhDb3VudCgpID09PSAwKSB7XG4gICAgYXR0YWNoUGF0Y2hEYXRhKG5hdGl2ZSwgbFZpZXcpO1xuICB9XG4gIGluY3JlYXNlRWxlbWVudERlcHRoQ291bnQoKTtcblxuICBpZiAoaGFzRGlyZWN0aXZlcykge1xuICAgIGNyZWF0ZURpcmVjdGl2ZXNJbnN0YW5jZXModFZpZXcsIGxWaWV3LCB0Tm9kZSk7XG4gICAgZXhlY3V0ZUNvbnRlbnRRdWVyaWVzKHRWaWV3LCB0Tm9kZSwgbFZpZXcpO1xuICB9XG4gIGlmIChsb2NhbFJlZnNJbmRleCAhPT0gbnVsbCkge1xuICAgIHNhdmVSZXNvbHZlZExvY2Fsc0luRGF0YShsVmlldywgdE5vZGUpO1xuICB9XG4gIHJldHVybiDJtcm1ZWxlbWVudFN0YXJ0O1xufVxuXG4vKipcbiAqIE1hcmsgdGhlIGVuZCBvZiB0aGUgZWxlbWVudC5cbiAqIEByZXR1cm5zIFRoaXMgZnVuY3Rpb24gcmV0dXJucyBpdHNlbGYgc28gdGhhdCBpdCBtYXkgYmUgY2hhaW5lZC5cbiAqXG4gKiBAY29kZUdlbkFwaVxuICovXG5leHBvcnQgZnVuY3Rpb24gybXJtWVsZW1lbnRFbmQoKTogdHlwZW9mIMm1ybVlbGVtZW50RW5kIHtcbiAgbGV0IGN1cnJlbnRUTm9kZSA9IGdldEN1cnJlbnRUTm9kZSgpITtcbiAgbmdEZXZNb2RlICYmIGFzc2VydERlZmluZWQoY3VycmVudFROb2RlLCAnTm8gcGFyZW50IG5vZGUgdG8gY2xvc2UuJyk7XG4gIGlmIChpc0N1cnJlbnRUTm9kZVBhcmVudCgpKSB7XG4gICAgc2V0Q3VycmVudFROb2RlQXNOb3RQYXJlbnQoKTtcbiAgfSBlbHNlIHtcbiAgICBuZ0Rldk1vZGUgJiYgYXNzZXJ0SGFzUGFyZW50KGdldEN1cnJlbnRUTm9kZSgpKTtcbiAgICBjdXJyZW50VE5vZGUgPSBjdXJyZW50VE5vZGUucGFyZW50ITtcbiAgICBzZXRDdXJyZW50VE5vZGUoY3VycmVudFROb2RlLCBmYWxzZSk7XG4gIH1cblxuICBjb25zdCB0Tm9kZSA9IGN1cnJlbnRUTm9kZTtcbiAgbmdEZXZNb2RlICYmIGFzc2VydFROb2RlVHlwZSh0Tm9kZSwgVE5vZGVUeXBlLkFueVJOb2RlKTtcblxuICBpZiAoaXNTa2lwSHlkcmF0aW9uUm9vdFROb2RlKHROb2RlKSkge1xuICAgIGxlYXZlU2tpcEh5ZHJhdGlvbkJsb2NrKCk7XG4gIH1cblxuICBkZWNyZWFzZUVsZW1lbnREZXB0aENvdW50KCk7XG5cbiAgY29uc3QgdFZpZXcgPSBnZXRUVmlldygpO1xuICBpZiAodFZpZXcuZmlyc3RDcmVhdGVQYXNzKSB7XG4gICAgcmVnaXN0ZXJQb3N0T3JkZXJIb29rcyh0VmlldywgY3VycmVudFROb2RlKTtcbiAgICBpZiAoaXNDb250ZW50UXVlcnlIb3N0KGN1cnJlbnRUTm9kZSkpIHtcbiAgICAgIHRWaWV3LnF1ZXJpZXMhLmVsZW1lbnRFbmQoY3VycmVudFROb2RlKTtcbiAgICB9XG4gIH1cblxuICBpZiAodE5vZGUuY2xhc3Nlc1dpdGhvdXRIb3N0ICE9IG51bGwgJiYgaGFzQ2xhc3NJbnB1dCh0Tm9kZSkpIHtcbiAgICBzZXREaXJlY3RpdmVJbnB1dHNXaGljaFNoYWRvd3NTdHlsaW5nKHRWaWV3LCB0Tm9kZSwgZ2V0TFZpZXcoKSwgdE5vZGUuY2xhc3Nlc1dpdGhvdXRIb3N0LCB0cnVlKTtcbiAgfVxuXG4gIGlmICh0Tm9kZS5zdHlsZXNXaXRob3V0SG9zdCAhPSBudWxsICYmIGhhc1N0eWxlSW5wdXQodE5vZGUpKSB7XG4gICAgc2V0RGlyZWN0aXZlSW5wdXRzV2hpY2hTaGFkb3dzU3R5bGluZyh0VmlldywgdE5vZGUsIGdldExWaWV3KCksIHROb2RlLnN0eWxlc1dpdGhvdXRIb3N0LCBmYWxzZSk7XG4gIH1cbiAgcmV0dXJuIMm1ybVlbGVtZW50RW5kO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gZW1wdHkgZWxlbWVudCB1c2luZyB7QGxpbmsgZWxlbWVudFN0YXJ0fSBhbmQge0BsaW5rIGVsZW1lbnRFbmR9XG4gKlxuICogQHBhcmFtIGluZGV4IEluZGV4IG9mIHRoZSBlbGVtZW50IGluIHRoZSBkYXRhIGFycmF5XG4gKiBAcGFyYW0gbmFtZSBOYW1lIG9mIHRoZSBET00gTm9kZVxuICogQHBhcmFtIGF0dHJzSW5kZXggSW5kZXggb2YgdGhlIGVsZW1lbnQncyBhdHRyaWJ1dGVzIGluIHRoZSBgY29uc3RzYCBhcnJheS5cbiAqIEBwYXJhbSBsb2NhbFJlZnNJbmRleCBJbmRleCBvZiB0aGUgZWxlbWVudCdzIGxvY2FsIHJlZmVyZW5jZXMgaW4gdGhlIGBjb25zdHNgIGFycmF5LlxuICogQHJldHVybnMgVGhpcyBmdW5jdGlvbiByZXR1cm5zIGl0c2VsZiBzbyB0aGF0IGl0IG1heSBiZSBjaGFpbmVkLlxuICpcbiAqIEBjb2RlR2VuQXBpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiDJtcm1ZWxlbWVudChcbiAgICBpbmRleDogbnVtYmVyLCBuYW1lOiBzdHJpbmcsIGF0dHJzSW5kZXg/OiBudW1iZXJ8bnVsbCxcbiAgICBsb2NhbFJlZnNJbmRleD86IG51bWJlcik6IHR5cGVvZiDJtcm1ZWxlbWVudCB7XG4gIMm1ybVlbGVtZW50U3RhcnQoaW5kZXgsIG5hbWUsIGF0dHJzSW5kZXgsIGxvY2FsUmVmc0luZGV4KTtcbiAgybXJtWVsZW1lbnRFbmQoKTtcbiAgcmV0dXJuIMm1ybVlbGVtZW50O1xufVxuXG5sZXQgX2xvY2F0ZU9yQ3JlYXRlRWxlbWVudE5vZGU6IHR5cGVvZiBsb2NhdGVPckNyZWF0ZUVsZW1lbnROb2RlSW1wbCA9XG4gICAgKHRWaWV3OiBUVmlldywgbFZpZXc6IExWaWV3LCB0Tm9kZTogVE5vZGUsIHJlbmRlcmVyOiBSZW5kZXJlciwgYWRqdXN0ZWRJbmRleDogbnVtYmVyLFxuICAgICBuYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIHJldHVybiBbdHJ1ZSwgY3JlYXRlRWxlbWVudE5vZGUocmVuZGVyZXIsIG5hbWUsIGdldE5hbWVzcGFjZSgpKV07XG4gICAgfVxuXG5mdW5jdGlvbiBsb2NhdGVPckNyZWF0ZUVsZW1lbnROb2RlSW1wbChcbiAgICB0VmlldzogVFZpZXcsIGxWaWV3OiBMVmlldywgdE5vZGU6IFROb2RlLCByZW5kZXJlcjogUmVuZGVyZXIsIGFkanVzdGVkSW5kZXg6IG51bWJlcixcbiAgICBuYW1lOiBzdHJpbmcpOiBbYm9vbGVhbiwgUkVsZW1lbnRdIHtcbiAgY29uc3QgbmdoID0gbFZpZXdbSFlEUkFUSU9OX0lORk9dO1xuICBjb25zdCBpbmRleCA9IGFkanVzdGVkSW5kZXggLSBIRUFERVJfT0ZGU0VUO1xuICBjb25zdCBpc0NyZWF0aW5nID0gIW5naCB8fCBpc0luU2tpcEh5ZHJhdGlvbkJsb2NrKCkgfHwgaXNOb2RlRGlzY29ubmVjdGVkKG5naCwgaW5kZXgpO1xuICBsZXQgbmF0aXZlOiBSRWxlbWVudDtcbiAgaWYgKGlzQ3JlYXRpbmcpIHtcbiAgICBuYXRpdmUgPSBjcmVhdGVFbGVtZW50Tm9kZShyZW5kZXJlciwgbmFtZSwgZ2V0TmFtZXNwYWNlKCkpO1xuICB9IGVsc2Uge1xuICAgIC8vIGh5ZHJhdGluZ1xuICAgIG5hdGl2ZSA9IGxvY2F0ZU5leHRSTm9kZTxSRWxlbWVudD4obmdoLCB0VmlldywgbFZpZXcsIHROb2RlKSE7XG4gICAgbmdEZXZNb2RlICYmXG4gICAgICAgIHZhbGlkYXRlTWF0Y2hpbmdOb2RlKG5hdGl2ZSBhcyB1bmtub3duIGFzIE5vZGUsIE5vZGUuRUxFTUVOVF9OT0RFLCBuYW1lLCBsVmlldywgdE5vZGUpO1xuICAgIG5nRGV2TW9kZSAmJiBtYXJrUk5vZGVBc0NsYWltZWRGb3JIeWRyYXRpb24obmF0aXZlKTtcbiAgfVxuICBpZiAobmdoICYmIGhhc05nU2tpcEh5ZHJhdGlvbkF0dHIodE5vZGUpKSB7XG4gICAgZW50ZXJTa2lwSHlkcmF0aW9uQmxvY2sodE5vZGUpO1xuXG4gICAgLy8gU2luY2UgdGhpcyBpc24ndCBoeWRyYXRhYmxlLCB3ZSBuZWVkIHRvIGVtcHR5IHRoZSBub2RlXG4gICAgLy8gc28gdGhlcmUncyBubyBkdXBsaWNhdGUgY29udGVudCBhZnRlciByZW5kZXJcbiAgICB3aGlsZSAoKG5hdGl2ZSBhcyBIVE1MRWxlbWVudCkuZmlyc3RDaGlsZCkge1xuICAgICAgbmF0aXZlLnJlbW92ZUNoaWxkKChuYXRpdmUgYXMgSFRNTEVsZW1lbnQpLmZpcnN0Q2hpbGQhKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFtpc0NyZWF0aW5nLCBuYXRpdmVdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlTG9jYXRlT3JDcmVhdGVFbGVtZW50Tm9kZUltcGwoKSB7XG4gIF9sb2NhdGVPckNyZWF0ZUVsZW1lbnROb2RlID0gbG9jYXRlT3JDcmVhdGVFbGVtZW50Tm9kZUltcGw7XG59XG4iXX0=