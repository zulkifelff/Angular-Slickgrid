import { EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Column, ColumnFilters, GridOption, OperatorType, CurrentFilter, OperatorString } from './../models/index';
export declare class FilterService {
    private translate;
    private _eventHandler;
    private _subscriber;
    private _filters;
    private _columnFilters;
    private _dataView;
    private _grid;
    private _gridOptions;
    private _onFilterChangedOptions;
    onFilterChanged: EventEmitter<string>;
    constructor(translate: TranslateService);
    init(grid: any, gridOptions: GridOption, columnDefinitions: Column[]): void;
    /**
     * Attach a backend filter hook to the grid
     * @param grid SlickGrid Grid object
     * @param gridOptions Grid Options object
     */
    attachBackendOnFilter(grid: any, options: GridOption): void;
    attachBackendOnFilterSubscribe(event: Event, args: any): Promise<void>;
    /** Clear the search filters (below the column titles) */
    clearFilters(): void;
    /**
     * Attach a local filter hook to the grid
     * @param grid SlickGrid Grid object
     * @param gridOptions Grid Options object
     * @param dataView
     */
    attachLocalOnFilter(grid: any, options: GridOption, dataView: any): void;
    customLocalFilter(dataView: any, item: any, args: any): boolean;
    dispose(): void;
    /**
     * Dispose of the filters, since it's a singleton, we don't want to affect other grids with same columns
     */
    disposeColumnFilters(): void;
    getColumnFilters(): ColumnFilters;
    getCurrentLocalFilters(): CurrentFilter[];
    callbackSearchEvent(e: Event | undefined, args: {
        columnDef: Column;
        operator?: OperatorType | OperatorString;
        searchTerms?: string[] | number[];
    }): void;
    addFilterTemplateToHeaderRow(args: {
        column: Column;
        grid: any;
        node: any;
    }): void;
    /**
     * A simple function that is attached to the subscriber and emit a change when the sort is called.
     * Other services, like Pagination, can then subscribe to it.
     * @param sender
     */
    emitFilterChangedBy(sender: string): void;
    /**
     * When user passes an array of preset filters, we need to pre-polulate each column filter searchTerm(s)
     * The process is to loop through the preset filters array, find the associated column from columnDefinitions and fill in the filter object searchTerm(s)
     * This is basically the same as if we would manually add searchTerm(s) to a column filter object in the column definition, but we do it programmatically.
     * At the end of the day, when creating the Filter (DOM Element), it will use these searchTerm(s) so we can take advantage of that without recoding each Filter type (DOM element)
     * @param gridOptions
     * @param columnDefinitions
     */
    populateColumnFilterSearchTerms(gridOptions: GridOption, columnDefinitions: Column[]): Column[];
    private updateColumnFilters(searchTerm, searchTerms, columnDef);
    private triggerEvent(evt, args, e);
}