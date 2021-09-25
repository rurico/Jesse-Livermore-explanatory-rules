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
  ) {}

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
    this.getDailyDate();
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
      this.getDailyDate();
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
    quote1 = parseInt(quote1);
    quote2 = parseInt(quote2);
    return (quote1 / quote2 - 1) * 100;
  }

  async getDailyDate() {
    await this.wait(this.allStockTsCode);
    const start = this.async.transform(this.startDate)!.toString();
    const end = this.async.transform(this.endDate)!.toString();
    const code = this.async.transform(this.code)!.toString();
    const startDate = moment(start).format('YYYYMMDD');
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
      map((arr) => {
        let head = arr.splice(0, 1);

        let status = null;

        const last = {
          /// 次级回升
          secondary_rally: <any>[],
          /// 自然回升
          natural_rally: <any>[],
          /// 上涨趋势
          upward_trend: <any>[],
          /// 下跌趋势
          downward_trend: <any>[],
          /// 自然回调
          natural_reaction: <any>[],
          /// 次级回调
          secondary_reaction: <any>[],
        };

        const lastLine = {
          /// 次级回升

          secondary_rally: { red: null, black: null },
          /// 自然回升

          natural_rally: { red: null, black: null },
          /// 上涨趋势

          upward_trend: { red: null, black: null },
          /// 下跌趋势

          downward_trend: { red: null, black: null },
          /// 自然回调

          natural_reaction: { red: null, black: null },
          /// 次级回调

          secondary_reaction: { red: null, black: null },
        };

        const hp = this.percent(close, head.close);
        if (hp >= 0) {
          const ho = Object.assign(
            {
              trade_date: moment(head.trade_date).format('YYYY-MM-DD'),
            },
            { upward_trend: close }
          );
          last.upward_trend.push(ho);
          status = 'upward_trend';
        } else {
          const ho = Object.assign(
            {
              trade_date: moment(head.trade_date).format('YYYY-MM-DD'),
            },
            { downward_trend: close }
          );
          last.downward_trend.push(ho);
          status = 'downward_trend';
        }

        for (const { trade_date, close } of arr) {
          const obj = {
            trade_date: moment(trade_date).format('YYYY-MM-DD'),
          };
          switch (status) {
            case 'natural_rally':
              // 6-h
              if (last.natural_rally.length) {
                const p1 = this.percent(
                  close,
                  last.natural_rally.last().natural_rally
                );
                const p2 = this.percent(
                  close,
                  last.natural_reaction.last().natural_reaction
                );
                if (p1 >= 6 && p2 <= 0) {
                  Object.assign(obj, { secondary_reaction: close });
                  last.secondary_reaction.push(obj);
                  status = 'secondary_reaction';
                }
                if (p2 >= 0) {
                  Object.assign(obj, { natural_reaction: close });
                  last.natural_reaction.push(obj);
                  status = 'natural_reaction';
                }
              }
              // 6-f
              if (last.upward_trend.length) {
                const p = this.percent(
                  close,
                  last.upward_trend.last().upward_trend
                );
                if (p >= 0) {
                  Object.assign(obj, { upward_trend: close });
                  last.upward_trend.push(obj);
                  status = 'upward_trend';
                }
              }
              // 5-a
              if (lastLine.natural_rally.black) {
                const p = this.percent(close, lastLine.natural_rally.black);
                if (p >= 3) {
                  Object.assign(obj, { upward_trend: close });
                  last.upward_trend.push(obj);
                  status = 'upward_trend';
                }
              }
              // 6-b
              if (last.natural_rally.length) {
                const p = this.percent(
                  close,
                  last.natural_rally.last().natural_rally
                );
                if (p >= -6) {
                  Object.assign(obj, { natural_reaction: close });
                  last.natural_reaction.push(obj);
                  status = 'natural_reaction';
                }
                // 6-c
                if (
                  this.percent(
                    close,
                    last.natural_rally.last().natural_rally
                  ) >= 0
                ) {
                  Object.assign(obj, { natural_rally: close });
                  last.natural_rally.push(obj);
                  status = 'natural_rally';
                }
              }

              break;
            case 'secondary_rally':
              // 6-g
              if (last.secondary_rally.length) {
                const p1 = this.percent(
                  close,
                  last.natural_reaction.last().natural_reaction
                );
                const p2 = this.percent(
                  close,
                  last.natural_rally.last().natural_rally
                );
                if (p1 >= 6 && p2 <= 0) {
                  Object.assign(obj, { secondary_rally: close });
                  last.secondary_rally.push(obj);
                  status = 'secondary_rally';
                }
                if (p2 >= 0) {
                  Object.assign(obj, { natural_rally: close });
                  last.natural_rally.push(obj);
                  status = 'natural_rally';
                }
              }
              break;
            case 'natural_reaction':
              // 6-g
              if (last.natural_reaction.length) {
                const p1 = this.percent(
                  close,
                  last.natural_reaction.last().natural_reaction
                );
                const p2 = this.percent(
                  close,
                  last.natural_rally.last().natural_rally
                );
                if (p1 >= 6 && p2 <= 0) {
                  Object.assign(obj, { secondary_rally: close });
                  last.secondary_rally.push(obj);
                  status = 'secondary_rally';
                }
              }
              // 6-e
              if (last.downward_trend.length) {
                const p = this.percent(
                  close,
                  last.downward_trend.last().downward_trend
                );
                if (p <= 0) {
                  Object.assign(obj, { downward_trend: close });
                  last.downward_trend.push(obj);
                  status = 'downward_trend';
                }
              }
              // 6-d
              if (last.upward_trend.length) {
                const p = this.percent(
                  close,
                  last.upward_trend.last().upward_trend
                );
                if (p >= 6) {
                  Object.assign(obj, { upward_trend: close });
                  last.upward_trend.push(obj);
                  status = 'upward_trend';
                }
              }
              // 6-d
              if (last.natural_rally.length) {
                const p = this.percent(
                  close,
                  last.natural_rally.last().natural_rally
                );
                if (p >= 0) {
                  Object.assign(obj, { natural_rally: close });
                  last.natural_rally.push(obj);
                  status = 'natural_rally';
                }
              }
              // 5-b
              if (lastLine.natural_reaction.red) {
                const p = this.percent(close, lastLine.natural_rally.red);
                if (p >= -3) {
                  Object.assign(obj, { downward_trend: close });
                  last.downward_trend.push(obj);
                  status = 'downward_trend';
                }
              }
              // 6-d
              if (last.natural_reaction.length) {
                const p = this.percent(
                  close,
                  last.natural_reaction.last().natural_reaction
                );
                if (p >= 6) {
                  Object.assign(obj, { natural_rally: close });
                  last.natural_rally.push(obj);
                  status = 'natural_rally';
                }
              }
              break;
            case 'upward_trend':
              // 6-a
              if (last.upward_trend.length) {
                const p = this.percent(
                  close,
                  last.natural_rally.last().natural_rally
                );
                if (p >= -6) {
                  Object.assign(obj, { natural_reaction: close });
                  last.natural_reaction.push(obj);
                  status = 'natural_reaction';
                }
              }
              break;
            case 'downward_trend':
              // 6-c
              if (last.downward_trend.length) {
                const p = this.percent(
                  close,
                  last.downward_trend.last().downward_trend
                );
                if (p >= 6) {
                  Object.assign(obj, { natural_rally: close });
                  last.natural_rally.push(obj);
                  status = 'natural_rally';
                }
              }
              break;
          }
          // 4-a
          if (last.upward_trend.length) {
            const p = this.percent(
              close,
              last.upward_trend.last().upward_trend
            );
            if (p >= -6) {
              Object.assign(obj, { natural_reaction: close });
              last.natural_reaction.push(obj);
              status = 'natural_reaction';
            }
            if (last.upward_trend.last()) {
              last.upward_trend.last().className += 'under-red';
              lastLine.upward_trend.red = close;
            }
          }
          // 4-b
          if (last.natural_reaction.length) {
            const p = this.percent(
              close,
              last.natural_reaction.last().natural_reaction
            );
            if (p >= 6) {
              Object.assign(obj, { natural_reaction: close });
              last.natural_reaction.push(obj);
              status = 'natural_reaction';
            }
            if (last.natural_reaction.last()) {
              last.natural_reaction.last().className += 'under-red';
              lastLine.natural_reaction.red = close;
            }
          }
          // 4-c
          if (last.downward_trend.length) {
            const p = this.percent(
              close,
              last.downward_trend.last().downward_trend
            );
            if (p >= 6) {
              Object.assign(obj, { natural_rally: close });
              last.natural_rally.push(obj);
              status = 'natural_rally';
            }
            if (last.downward_trend.last()) {
              last.downward_trend.last().className += 'under-black';
              lastLine.downward_trend.black = close;
            }
          }
          // 4-d
          if (last.natural_rally.length) {
            const p = this.percent(
              close,
              last.natural_rally.last().natural_rally
            );
            if (p >= -6) {
              Object.assign(obj, { natural_rally: close });
              last.natural_rally.push(obj);
              status = 'natural_rally';
            }
            if (last.natural_rally.last()) {
              last.natural_rally.last().className += 'under-black';
              lastLine.natural_rally.black = close;
            }
          }
        }

        const r = []
          .concat(
            last.secondary_rally,
            last.natural_rally,
            last.upward_trend,
            last.downward_trend,
            last.natural_reaction,
            last.secondary_reaction
          )
          .sort((a: any, b: any) => moment(a.trade_date).diff(b.trade_date));
        console.log(r);

        return r;
      })
    );
  }
}
