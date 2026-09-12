/**
 * ECharts 按需注册。
 *
 * 只注册实际用到的图表与组件，避免把整个 ECharts（约 1 MB）打进产物。
 * 新增图表类型时必须在这里补注册，否则运行时不会报错、只是画不出来。
 *
 * 注意：本文件是唯一 import 'echarts/core' 的地方，
 * 其它图表组件一律 import VChart 与这里的类型。
 */
import { use } from 'echarts/core'

import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([
  CanvasRenderer,
  // 图表类型
  LineChart,
  BarChart,
  ScatterChart,
  PieChart,
  // 组件
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
  // 异常消费的阈值参考线
  MarkLineComponent,
])

export type { EChartsOption } from 'echarts'
