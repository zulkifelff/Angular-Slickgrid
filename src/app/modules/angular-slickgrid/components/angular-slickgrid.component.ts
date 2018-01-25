// import 3rd party vendor libs
import 'slickgrid/lib/jquery-ui-1.11.3';
import 'slickgrid/lib/jquery.event.drag-2.3.0';
import 'slickgrid/slick.core';
import 'slickgrid/slick.dataview';
import 'slickgrid/slick.grid';
import 'slickgrid/slick.dataview';
import 'slickgrid/controls/slick.columnpicker';
import 'slickgrid/controls/slick.gridmenu';
import 'slickgrid/controls/slick.pager';
import 'slickgrid/plugins/slick.autotooltips';
import 'slickgrid/plugins/slick.cellcopymanager';
import 'slickgrid/plugins/slick.cellexternalcopymanager';
import 'slickgrid/plugins/slick.cellrangedecorator';
import 'slickgrid/plugins/slick.cellrangeselector';
import 'slickgrid/plugins/slick.cellselectionmodel';
import 'slickgrid/plugins/slick.checkboxselectcolumn';
import 'slickgrid/plugins/slick.headerbuttons';
import 'slickgrid/plugins/slick.headermenu';
import 'slickgrid/plugins/slick.rowmovemanager';
import 'slickgrid/plugins/slick.rowselectionmodel';
import { AfterViewInit, Component, EventEmitter, Injectable, Input, Output, OnDestroy, OnInit } from '@angular/core';
import { castToPromise } from './../services/utilities';
import { GlobalGridOptions } from './../global-grid-options';
import { CellArgs, Column, FormElementType, GraphqlResult, GridOption } from './../models';
import { ControlAndPluginService } from './../services/controlAndPlugin.service';
import { FilterService } from './../services/filter.service';
import { GraphqlService } from './../services/graphql.service';
import { GridEventService } from './../services/gridEvent.service';
import { GridExtraService } from './../services/gridExtra.service';
import { ResizerService } from './../services/resizer.service';
import { SortService } from './../services/sort.service';
import { TranslateService } from '@ngx-translate/core';

import $ from 'jquery';

// using external js modules in Angular
declare var Slick: any;

@Injectable()
@Component({
  selector: 'angular-slickgrid',
  template: `
    <div id="slickGridContainer-{{gridId}}" class="gridPane">
    <div attr.id='{{gridId}}'
            class="slickgrid-container"
            [style.height]="gridHeightString"
            [style.width]="gridWidthString">
    </div>

    <slick-pagination id="slickPagingContainer-{{gridId}}" *ngIf="showPagination" [gridPaginationOptions]="gridPaginationOptions"></slick-pagination>
    </div>
  `
})
export class AngularSlickgridComponent implements AfterViewInit, OnDestroy, OnInit {
  private _dataset: any[];
  private _dataView: any;
  private _gridOptions: GridOption;
  grid: any;
  gridPaginationOptions: GridOption;
  gridHeightString: string;
  gridWidthString: string;
  showPagination = false;

  @Output() dataviewChanged = new EventEmitter<any>();
  @Output() gridChanged = new EventEmitter<any>();
  @Output() onDataviewCreated = new EventEmitter<any>();
  @Output() onGridCreated = new EventEmitter<any>();
  @Output() onBeforeGridCreate = new EventEmitter<boolean>();
  @Output() onBeforeGridDestroy = new EventEmitter<any>();
  @Output() onAfterGridDestroyed = new EventEmitter<boolean>();
  @Input() gridId: string;
  @Input() columnDefinitions: Column[];
  @Input() gridOptions: GridOption;
  @Input() gridHeight = 100;
  @Input() gridWidth = 600;
  @Input()
  set dataset(dataset: any[]) {
    this._dataset = dataset;
    this.refreshGridData(dataset);
  }
  get dataset(): any[] {
    return this._dataView.getItems();
  }

  constructor(
    private filterService: FilterService,
    private sortService: SortService,
    private gridExtraService: GridExtraService,
    private gridEventService: GridEventService,
    private resizer: ResizerService,
    private controlAndPluginService: ControlAndPluginService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
    this.onBeforeGridCreate.emit(true);
    this.gridHeightString = `${this.gridHeight}px`;
    this.gridWidthString = `${this.gridWidth}px`;
  }

  ngOnDestroy(): void {
    this.onBeforeGridDestroy.emit(this.grid);
    this.destroy();
    this.onAfterGridDestroyed.emit(true);
  }

  destroy() {
    this._dataView = [];
    this._gridOptions = {};
    this.grid.destroy();
    this.controlAndPluginService.destroy();
    this.filterService.destroy();
    this.resizer.destroy();
    this.sortService.destroy();
  }

  ngAfterViewInit() {
    // make sure the dataset is initialized (if not it will throw an error that it cannot getLength of null)
    this._dataset = this._dataset || [];
    this.createBackendApiInternalPostProcessCallback();
    this._gridOptions = this.mergeGridOptions();

    this._dataView = new Slick.Data.DataView();
    this.controlAndPluginService.createPluginBeforeGridCreation(this.columnDefinitions, this._gridOptions);
    this.grid = new Slick.Grid(`#${this.gridId}`, this._dataView, this.columnDefinitions, this._gridOptions);

    this.controlAndPluginService.attachDifferentControlOrPlugins(this.grid, this.columnDefinitions, this._gridOptions, this._dataView);
    this.attachDifferentHooks(this.grid, this._gridOptions, this._dataView);

    // emit the Grid & DataView object to make them available in parent component
    this.onGridCreated.emit(this.grid);
    this.onDataviewCreated.emit(this._dataView);

    // OBSOLETE in future releases, previous emitter functions (decided to rename them with onX prefix)
    this.gridChanged.emit(this.grid);
    this.dataviewChanged.emit(this._dataView);

    this.grid.init();
    this._dataView.beginUpdate();
    this._dataView.setItems(this._dataset);
    this._dataView.endUpdate();

    // attach resize ONLY after the dataView is ready
    this.attachResizeHook(this.grid, this._gridOptions);

    // attach grid extra service
    const gridExtraService = this.gridExtraService.init(this.grid, this.columnDefinitions, this._gridOptions, this._dataView);

    // when user enables translation, we need to translate Headers on first pass & subsequently in the attachDifferentHooks
    if (this._gridOptions.enableTranslate) {
      this.controlAndPluginService.translateHeaders();
    }
  }

  /**
   * Define what our internal Post Process callback, it will execute internally after we get back result from the Process backend call
   * For now, this is GraphQL Service only feautre and it will basically refresh the Dataset & Pagination without having the user to create his own PostProcess every time
   */
  createBackendApiInternalPostProcessCallback() {
    if (this.gridOptions.onBackendEventApi && this.gridOptions.onBackendEventApi.service instanceof GraphqlService) {
      this.gridOptions.onBackendEventApi.internalPostProcess = (processResult: any) => {
        // make sure it's an instance of GraphQL Service before trying to execute it
        if (this.gridOptions.onBackendEventApi.service instanceof GraphqlService && processResult) {
          const datasetName = this.gridOptions.onBackendEventApi.service.getDatasetName();
          this._dataset = processResult.data[datasetName].nodes;
          this.gridOptions.pagination.totalItems = processResult.data[datasetName].totalCount;
          this.refreshGridData(this._dataset);
        }
      }
    }
  }

  attachDifferentHooks(grid: any, gridOptions: GridOption, dataView: any) {
    // on locale change, we have to manually translate the Headers, GridMenu
    this.translate.onLangChange.subscribe((event) => {
      if (gridOptions.enableTranslate) {
        this.controlAndPluginService.translateHeaders();
        this.controlAndPluginService.translateColumnPicker();
        this.controlAndPluginService.translateGridMenu();
      }
    });

    // attach external sorting (backend) when available or default onSort (dataView)
    if (gridOptions.enableSorting) {
      (gridOptions.onBackendEventApi) ? this.sortService.attachBackendOnSort(grid, gridOptions) : this.sortService.attachLocalOnSort(grid, gridOptions, this._dataView);
    }

    // attach external filter (backend) when available or default onFilter (dataView)
    if (gridOptions.enableFiltering) {
      this.filterService.init(grid, gridOptions, this.columnDefinitions);
      (gridOptions.onBackendEventApi) ? this.filterService.attachBackendOnFilter(grid, gridOptions) : this.filterService.attachLocalOnFilter(grid, gridOptions, this._dataView);
    }

    // if user set an onInit Backend, we'll run it right away
    const serviceOptions = (gridOptions.onBackendEventApi && gridOptions.onBackendEventApi.service && gridOptions.onBackendEventApi.service.options) ? gridOptions.onBackendEventApi.service.options : null;
    const isExecuteCommandOnInit = (!serviceOptions) ? false : serviceOptions['executeProcessCommandOnInit'] || false;
    if (gridOptions.onBackendEventApi && (gridOptions.onBackendEventApi.onInit || isExecuteCommandOnInit)) {
      const backendApi = gridOptions.onBackendEventApi;
      const query = backendApi.service.buildQuery();
      const observableOrPromise = (isExecuteCommandOnInit) ? gridOptions.onBackendEventApi.process(query) : gridOptions.onBackendEventApi.onInit(query);

      // wrap this inside a setTimeout to avoid timing issue since the gridOptions needs to be ready before running this onInit
      setTimeout(async () => {
        if (gridOptions.onBackendEventApi.preProcess) {
          gridOptions.onBackendEventApi.preProcess();
        }

        // the process could be an Observable (like HttpClient) or a Promise
        // in any case, we need to have a Promise so that we can await on it (if an Observable, convert it to Promise)
        const processResult = await castToPromise(observableOrPromise);

        // define what our internal Post Process callback, only available for GraphQL Service for now
        // it will basically refresh the Dataset & Pagination without having the user to create his own PostProcess every time
        if (gridOptions.onBackendEventApi.service instanceof GraphqlService && processResult) {
          gridOptions.onBackendEventApi.internalPostProcess(processResult);
        }

        // send the response process to the postProcess callback
        if (gridOptions.onBackendEventApi.postProcess) {
          gridOptions.onBackendEventApi.postProcess(processResult);
        }
      });
    }

    // on cell click, mainly used with the columnDef.action callback
    this.gridEventService.attachOnCellChange(grid, this._gridOptions, dataView);
    this.gridEventService.attachOnClick(grid, this._gridOptions, dataView);

    dataView.onRowCountChanged.subscribe((e: any, args: any) => {
      grid.updateRowCount();
      grid.render();
    });
    dataView.onRowsChanged.subscribe((e: any, args: any) => {
      grid.invalidateRows(args.rows);
      grid.render();
    });
  }

  attachResizeHook(grid: any, options: GridOption) {
    // expand/autofit columns on first page load
    if (grid && options.autoFitColumnsOnFirstLoad) {
      grid.autosizeColumns();
    }

    // auto-resize grid on browser resize
    this.resizer.init(grid, options);
    if (options.enableAutoResize) {
      this.resizer.attachAutoResizeDataGrid();
      if (grid && options.autoFitColumnsOnFirstLoad) {
        grid.autosizeColumns();
      }
    } else {
      this.resizer.resizeGrid(0, { height: this.gridHeight, width: this.gridWidth });
    }
  }

  mergeGridOptions(): GridOption {
    this.gridOptions.gridId = this.gridId;
    this.gridOptions.gridContainerId = `slickGridContainer-${this.gridId}`;
    if (this.gridOptions.enableFiltering) {
      this.gridOptions.showHeaderRow = true;
    }
    // use jquery extend to deep merge and avoid immutable properties changed in GlobalGridOptions after route change
    return $.extend(true, {}, GlobalGridOptions, this.gridOptions);
  }

  /**
   * When dataset changes, we need to refresh the entire grid UI & possibly resize it as well
   * @param {object} dataset
   */
  refreshGridData(dataset: any[]) {
    if (dataset && this.grid) {
      this._dataView.setItems(dataset);

      // this.grid.setData(dataset);
      this.grid.invalidate();
      this.grid.render();

      if (this._gridOptions.enablePagination) {
        this.showPagination = true;
        this.gridPaginationOptions = this.mergeGridOptions();
      }
      if (this.grid &&  this._gridOptions.enableAutoResize) {
        // resize the grid inside a slight timeout, in case other DOM element changed prior to the resize (like a filter/pagination changed)
        this.resizer.resizeGrid(10);
        // this.grid.autosizeColumns();
      }
    }
  }

  /** Toggle the filter row displayed on first row
   * @param {boolean} isShowing
   */
  showHeaderRow(isShowing: boolean) {
    this.grid.setHeaderRowVisibility(isShowing);
    return isShowing;
  }

  /** Toggle the filter row displayed on first row */
  toggleHeaderRow() {
    const isShowing = !this.grid.getOptions().showHeaderRow;
    this.grid.setHeaderRowVisibility(isShowing);
    return isShowing;
  }
}
