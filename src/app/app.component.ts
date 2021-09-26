import { AsyncPipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import * as moment from 'moment';
import { ajax, AjaxResponse } from 'rxjs/ajax';
import { combineLatest, Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';

declare global {
  interface Array<T> {
    last(): any;
  }
}
Array.prototype.last = function () {
  try {
    return this[this.length - 1];
  } catch (_) {
    return null;
  }
};
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [AsyncPipe],
})
export class AppComponent implements OnInit {
  displayedColumns: string[] = [
    'date',
    'secondary_rally',
    'natural_rally',
    'upward_trend',
    'downward_trend',
    'natural_reaction',
    'secondary_reaction',
  ];

  code!: Observable<String | null>;
  queryParams!: Observable<Params>;
  dateRangeGroup!: FormGroup;
  startDate!: Observable<String | null>;
  endDate!: Observable<String | null>;
  token!: Observable<String | null>;

  lastStart!: string;
  lastEnd!: string;
  lastLock = false;
  allStockTsCode!: any;

  stock!: any;

  chat!: Observable<Array<any>>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private async: AsyncPipe
  ) { }

  ngOnInit(): void {
    const UrlObservable = of<any>(new URL(window.location.toString()));
    this.code = UrlObservable.pipe(
      map(({ pathname }: any) => pathname.substr(1))
    );

    this.queryParams = this.route.queryParams;
    this.startDate = this.queryParams.pipe(map(({ startDate }) => startDate));
    this.endDate = this.queryParams.pipe(map(({ endDate }) => endDate));
    this.token = this.queryParams.pipe(map(({ token }) => token));

    combineLatest(this.startDate, this.endDate).subscribe(
      ([startDate, endDate]) => {
        const start =
          typeof startDate === 'string'
            ? moment(startDate).toDate()
            : moment().toDate();
        const end =
          typeof endDate === 'string'
            ? moment(endDate).toDate()
            : moment().toDate();
        this.dateRangeGroup = new FormGroup({
          start: new FormControl(
            new Date(start.getFullYear(), start.getMonth(), start.getDate())
          ),
          end: new FormControl(
            new Date(end.getFullYear(), end.getMonth(), end.getDate())
          ),
        });
      }
    );
    const lsAllStock = window.localStorage.getItem('allStockTsCode');
    if (lsAllStock) {
      this.allStockTsCode = JSON.parse(lsAllStock);
    } else {
      setTimeout(() => {
        this.initAllStockTsCode();
      }, 16);
    }
    this.getDailyDate();
  }

  changeCode(event: any): void {
    const code = event.target.value;
    const startDate = this.async.transform(this.startDate);
    const endDate = this.async.transform(this.endDate);
    const token = this.async.transform(this.token);
    this.router.navigate([code], {
      queryParams: { startDate, endDate, token },
    });
    // this.getDailyDate();
  }

  changeLocation(): void {
    const { start, end } = this.dateRangeGroup.value;
    if ((this.lastEnd !== end || this.lastStart !== start) && this.lastLock) {
      this.lastStart = start;
      this.lastEnd = end;
      const startDate = moment(start).format('YYYYMMDD');
      const endDate = moment(end).format('YYYYMMDD');
      const code = this.async.transform(this.code);
      const token = this.async.transform(this.token);
      this.router.navigate([code], {
        queryParams: { startDate, endDate, token },
      });
      // this.getDailyDate();
    }
    this.lastLock = !this.lastLock;
  }

  requestTushare(param: any): Observable<AjaxResponse> {
    return ajax.post(
      'http://localhost:4200/api',
      Object.assign({ token: this.async.transform(this.token) }, param),
      { 'Content-Type': 'application/json' }
    );
  }

  initAllStockTsCode(): void {
    this.requestTushare({
      api_name: 'stock_basic',
      params: {},
      fields: 'ts_code,symbol,name',
    })
      .pipe(
        map(({ response }: any) =>
          response.data.items.reduce(
            (acc: Object, [code, symbol, name]: [string, string, string]) => ({
              ...acc,
              [symbol]: { code, symbol, name },
            }),
            {}
          )
        )
      )
      .subscribe((data) => {
        this.allStockTsCode = data;
        window.localStorage.setItem('allStockTsCode', JSON.stringify(data));
      });
  }

  sleep(ms: any) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async wait(value: any) {
    for await (const i of Array(99).fill(0)) {
      await this.sleep(200);
      if (value) break;
    }
  }

  percent(quote1: any, quote2: any) {
    quote1 = parseFloat(quote1);
    quote2 = parseFloat(quote2);
    return (quote1 / quote2 - 1) * 100;
  }

  *iterRight(array: any) {
    var i = array.length;
    while (i--) yield array[i];
  }

  findBy(lastKey: string, arr: any[], line: string | null) {
    for (const item of this.iterRight(arr)) {
      const lastItem = item[lastKey]
      // 有线，并且最后一个的class名字相等
      if (line && lastItem && lastItem.className == line) {
        return lastItem
      }
      if (lastItem) {
        return lastItem
      }
    }
    return null
  }

  isTrade(close: any, key: string, arr: any[], cb: (percent: any) => boolean, line = null): boolean {
    const last = this.findBy(key, arr, line)
    if (last) {
      const p = this.percent(close, last.close)
      return cb(p)
    }
    return false
  }

  groupBy(arr: any[]): any[] {
    const [first, second] = arr.splice(0, 2)
    const list = <any>[]
    let trade = null
    let lastPrice = null

    // 画线
    const drawLine = (trade: string, line: string, arr: any[]) => {
      const last = this.findBy(trade, arr, null)
      last && (last.className = line)
    }

    // 记录行情和趋势
    const recordTrade = (key: string, trade_date: string, close: number) => {
      const o = {
        trade_date: moment(trade_date).format('YYYY-MM-DD'),
      }
      list.push(Object.assign(o, { [key]: { close } }))
      lastPrice = close
      trade = key
    }

    if (this.percent(second.close, first.close) > 0) {
      recordTrade('upward_trend', second.trade_date, second.close);
    } else {
      recordTrade('downward_trend', second.trade_date, second.close);
    }

    for (const { trade_date, close } of arr) {
      // 4-a 下跌幅度距离上涨趋势栏最后一个数字约6点
      if (this.isTrade(close, 'upward_trend', list, (p) => p > -6)) {
        console.log('4-a');

        // 上涨趋势栏最后一个数据下画红线
        drawLine('upward_trend', 'red-line', list)
        // 填入自然回调栏
        recordTrade('natural_reaction', trade_date, close); continue
      }

      // 4-b 上升幅度距离自然回调最后一个数字约6点
      if (this.isTrade(close, 'natural_reaction', list, (p) => p > 6)) {
        console.log('4-b');

        // 自然回调最后一个数据下画红线
        drawLine('natural_reaction', 'red-line', list)

        // 填入自然回升栏
        recordTrade('natural_rally', trade_date, close); continue
      }

      // 4-c 上升幅度距离下跌趋势栏最后一个数字约6点
      if (this.isTrade(close, 'downward_trend', list, (p) => p > 6)) {
        console.log('4-c');

        // 下跌趋势最后一栏下画黑线
        drawLine('downward_trend', 'black-line', list)

        // 填入自然回升栏
        recordTrade('natural_rally', trade_date, close); continue
      }

      // 4-d 下跌幅度距离自然回升栏最后一个数字约6点
      if (this.isTrade(close, 'natural_rally', list, (p) => p > -6)) {
        console.log('4-d');

        // 自然回升栏最后一栏下画黑线
        drawLine('natural_rally', 'black-line', list)

        // 填入自然回调栏
        recordTrade('natural_reaction', trade_date, close); continue
      }

      // 5-a 自然回升栏中做价格记录，最新价比自然回调内画黑线的最后一个价格涨了3点或更多
      if (trade === 'natural_rally' && this.isTrade(close, 'natural_rally', list, (p) => p > 3), 'black-line') {
        console.log('5-a');

        // 填入上涨趋势栏
        recordTrade('upward_trend', trade_date, close); continue
      }

      // 5-b 自然回调栏中做价格记录，最新价比自然回调内画红线的最后一个价格跌了3点或更多
      if (trade === 'natural_reaction' && this.isTrade(close, 'natural_rally', list, (p) => p > -3), 'red-line') {
        console.log('5-b');

        // 填入下跌趋势栏
        recordTrade('downward_trend', trade_date, close); continue
      }

      // 6-a 上涨趋势中做价格记录，最新价格下跌幅度达到大约6点
      if (trade === 'upward_trend' && this.isTrade(close, 'upward_trend', list, (p) => p > -6)) {
        console.log('6-a');

        // 填入自然回调栏
        recordTrade('natural_reaction', trade_date, close); continue
      }

      // 6-b 6-e 价格低于下跌趋势中最后价格，填入下跌趋势中
      if (trade === 'natural_reaction' && this.isTrade(close, 'downward_trend', list, (p) => p < 0)) {
        console.log('6-b 6-e');

        // 填入下跌趋势栏
        recordTrade('downward_trend', trade_date, close); continue
      }

      // 6-a 只要低于自然回调栏最后记录的价格，继续填入自然回调中
      if (trade === 'natural_reaction' && this.isTrade(close, 'natural_reaction', list, (p) => p < 0)) {
        console.log('6-a');

        // 填入自然回调栏
        recordTrade('natural_reaction', trade_date, close); continue
      }

      // 6-h
      if ((trade === 'natural_rally' || trade === 'secondary_reaction') && this.isTrade(close, 'natural_rally', list, (p) => p > -6) && this.isTrade(close, 'natural_reaction', list, (p) => p > 0)) {
        console.log('6-h-1');

        // 填入次级回调
        recordTrade('secondary_reaction', trade_date, close); continue
      }

      // 6-h
      if (trade === 'secondary_reaction' && this.isTrade(close, 'natural_reaction', list, (p) => p < 0)) {
        console.log('6-h-2');

        // 填入自然回调栏
        recordTrade('natural_reaction', trade_date, close); continue
      }

      // 6-b 自然回升栏做价格记录，最新价格下跌幅度达到大约6点
      if (trade === 'natural_rally' && this.isTrade(close, 'natural_reaction', list, (p) => p > -6)) {
        console.log('6-b');

        // 填入自然回调栏
        recordTrade('natural_reaction', trade_date, close); continue
      }

      // 6-c 下跌行情中记录行情，最新价格上涨幅度达到大约6点
      if (trade === 'downward_trend' && this.isTrade(close, 'downward_trend', list, (p) => p > 6)) {
        console.log('6-c');

        // 填入自然回升栏
        recordTrade('natural_rally', trade_date, close); continue
      }

      // 6-d 6-f 最新价格高于上涨趋势栏最后价格，继入上涨趋势栏
      if (trade === 'natural_rally' && this.isTrade(close, 'upward_trend', list, (p) => p > 0)) {
        console.log('6-d 6-f');

        // 填入上涨趋势栏
        recordTrade('upward_trend', trade_date, close); continue
      }

      // 6-c 6-d 最新价格高于自然回升栏最后价格，继续填入自然回升栏
      if (trade === 'natural_rally' && this.isTrade(close, 'natural_rally', list, (p) => p > 0)) {
        console.log('6-c 6-d');

        // 填入自然回升栏
        recordTrade('natural_rally', trade_date, close); continue
      }

      // 6-g 
      if ((trade === 'natural_reaction' || trade === 'secondary_rally') && this.isTrade(close, 'natural_reaction', list, (p) => p > 6) && this.isTrade(close, 'natural_rally', list, (p) => p < 0)) {
        console.log('6-g-1');

        // 填入次级回升栏
        recordTrade('secondary_rally', trade_date, close); continue
      }

      // 6-g
      if (trade === 'secondary_rally' && this.isTrade(close, 'natural_rally', list, (p) => p > 0)) {
        console.log('6-g-2');

        // 填入自然回升栏
        recordTrade('natural_rally', trade_date, close); continue
      }

      // 6-d 自然回调中记录价格，最新价格上涨幅度大约6点
      if (trade === 'natural_reaction' && this.isTrade(close, 'natural_reaction', list, (p) => p > 6)) {
        console.log('6-d');

        // 填入自然回升栏
        recordTrade('natural_rally', trade_date, close); continue
      }
    }
    return list;
  }

  async getDailyDate() {
    await this.wait(this.allStockTsCode);
    const start = this.async.transform(this.startDate)!.toString();
    const end = this.async.transform(this.endDate)!.toString();
    const code = this.async.transform(this.code)!.toString();
    const startDate = moment(start).subtract(1, 'days').format('YYYYMMDD');
    const endDate = moment(end).format('YYYYMMDD');

    const ts_code = this.allStockTsCode[code].code;
    this.stock = this.allStockTsCode[code];

    this.chat = this.requestTushare({
      api_name: 'daily',
      params: {
        ts_code,
        start_date: startDate,
        end_date: endDate,
      },
      fields: 'trade_date,close',
    }).pipe(
      map(
        ({
          response: {
            data: { items },
          },
        }) =>
          items
            .map(([trade_date, close]: any) => ({
              trade_date,
              close: Number(close),
            }))
            .reverse()
      ),
      map((arr) => this.groupBy(arr)),
      tap(console.log),
    );
  }
}
