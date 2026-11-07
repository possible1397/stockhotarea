# 台股題材資金流向追蹤

> 把每日台股成交資料依「題材」聚合，用熱力圖與流向圖呈現資金在不同主題間的輪動。Vite + Express，每日收盤後自動更新。

個股漲跌看久了容易見樹不見林。這個工具把個股歸入題材（AI 伺服器、重電、航運、生技……），用題材為單位看資金的流入與流出，判斷輪動的方向與階段。

## 功能

- **題材熱力圖**：以面積表示成交金額、顏色表示漲跌幅，一眼看出今天資金在哪
- **資金流向圖**：追蹤題材之間的資金移動，觀察輪動路徑
- **題材排行**：依資金流入、漲幅、成交量排序
- **個股明細**：點入題材查看成分股與各自表現
- **自動更新**：node-cron 於收盤後排程抓取當日資料

## 技術架構

```
┌──────────────────────────────┐
│  前端 (Vite + Vanilla JS)     │
│  heatmap / flowChart /        │
│  ranking / detail / sidebar   │
└───────────────┬──────────────┘
                │  REST
┌───────────────▼──────────────┐
│  Express 伺服器                │
│  ├ routes.js     API          │
│  ├ fetcher.js    每日抓取      │
│  ├ aggregator.js 題材聚合      │
│  └ node-cron     收盤後排程    │
└───────────────┬──────────────┘
                │
┌───────────────▼──────────────┐
│  data/                        │
│  ├ themes.json   題材分類定義  │
│  └ daily/        每日快取      │
└──────────────────────────────┘
```

| 層 | 技術 |
| --- | --- |
| 前端 | Vite 6、Vanilla JS（無框架）、Canvas 繪圖 |
| 後端 | Express 4、node-cron |
| 儲存 | JSON 檔（資料量小，不需資料庫） |

## 快速開始

```bash
npm install
npm run dev        # 同時啟動前端 (Vite) 與後端 (Express)
```

分開啟動：

```bash
npm run server     # Express，預設 port 3000
npm run client     # Vite 開發伺服器
```

手動抓取當日資料：

```bash
npm run fetch
```

建置：

```bash
npm run build
```

## 專案結構

```
├── src/
│   ├── main.js              前端進入點
│   ├── components/
│   │   ├── heatmap.js       題材熱力圖
│   │   ├── flowChart.js     資金流向圖
│   │   ├── ranking.js       題材排行
│   │   ├── detail.js        個股明細
│   │   └── sidebar.js       篩選側欄
│   └── utils/               API 封裝與格式化
├── server/
│   ├── index.js             Express 進入點與排程
│   ├── routes.js            API 路由
│   ├── fetcher.js           每日資料抓取
│   └── aggregator.js        依題材聚合
└── data/
    └── themes.json          題材分類定義
```

## 題材分類怎麼來的

`data/themes.json` 是人工維護的對照表，把個股代號歸入一或多個題材。刻意不用自動分類——台股的題材本來就是市場共識而非客觀事實（同一支股票在不同時期會被歸到不同題材），自動分類反而會失準。這份對照表需要隨市場關注焦點調整。

## 資料來源

公開市場收盤資料。抓取時有請求間隔與重試，遵守來源站台的使用規範。

## 授權

MIT
