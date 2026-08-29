import * as stylex from "@stylexjs/stylex";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef, useState } from "react";

import { colors } from "../../theme/tokens.stylex";
import { buildMetricChartOption, type MetricChartOptionsInput } from "./metric-chart-options";

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

type MetricChartProps = MetricChartOptionsInput & {
  readonly accessibleName: string;
  readonly summary: string;
};

export function MetricChart({ accessibleName, summary, ...options }: MetricChartProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(buildMetricChartOption({ ...options, reducedMotion }), {
      notMerge: true,
    });
  }, [options, reducedMotion]);

  return (
    <figure aria-label={accessibleName} role="img" {...stylex.props(styles.figure)}>
      <div aria-hidden="true" {...stylex.props(styles.chart)} ref={elementRef} />
      <figcaption {...stylex.props(styles.screenReaderOnly)}>{summary}</figcaption>
    </figure>
  );
}

const styles = stylex.create({
  figure: { height: "100%", margin: 0, minHeight: 220, width: "100%" },
  chart: { color: colors.textMuted, height: "100%", minHeight: 220, width: "100%" },
  screenReaderOnly: {
    clip: "rect(0, 0, 0, 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
