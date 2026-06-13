<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Tooltip,
		Filler,
		CategoryScale
	} from 'chart.js';

	Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

	interface Point {
		x: number;
		y: number;
		meta?: {
			cycleNumber: number;
			cyclePeriod: string;
			paymentDates: string;
			amountLabel: string;
		};
	}

	let {
		points,
		yLabel = 'Amount',
		showXAxis = true,
		showXAxisLabels = true,
		height = 220
	}: {
		points: Point[];
		yLabel?: string;
		showXAxis?: boolean;
		showXAxisLabels?: boolean;
		height?: number;
	} = $props();

	type ChartPoint = {
		x: number;
		y: number;
		meta?: Point['meta'];
	};

	let canvas: HTMLCanvasElement | null = null;
	let chart: Chart<'line', ChartPoint[], unknown> | null = null;

	function renderChart() {
		if (!canvas) return;
		if (chart) {
			chart.destroy();
		}

		const chartPoints: ChartPoint[] = points.map((point) => ({
			x: point.x,
			y: point.y,
			meta: point.meta
		}));
		const pointCount = chartPoints.length;
		const maxCycle = chartPoints.length > 0 ? Math.max(...chartPoints.map((point) => point.x)) : 1;
		const xMin = pointCount <= 1 ? 0.5 : pointCount === 2 ? 0.5 : 0.7;
		const xMax = pointCount <= 1 ? 1.5 : pointCount === 2 ? maxCycle + 0.5 : maxCycle + 0.3;
		const pointRadius = pointCount <= 2 ? 5 : 3.5;
		const pointHoverRadius = pointCount <= 2 ? 7 : 5;
		const yValues = chartPoints.map((point) => point.y);
		const rawMinY = yValues.length > 0 ? Math.min(...yValues) : 0;
		const rawMaxY = yValues.length > 0 ? Math.max(...yValues) : 0;
		const yRange = rawMaxY - rawMinY;
		const yPadding =
			yValues.length === 0
				? 1
				: yRange === 0
					? Math.max(rawMaxY * 0.25, 10)
					: Math.max(yRange * 0.35, rawMaxY * 0.08, 5);
		const yMin = Math.max(0, rawMinY - yPadding);
		const yMax = rawMaxY + yPadding;

		chart = new Chart(canvas, {
			type: 'line',
			data: {
				datasets: [
					{
						label: 'Payments',
						data: chartPoints,
						borderColor: '#3b82f6',
						backgroundColor: 'transparent',
						tension: 0,
						borderWidth: 2,
						pointRadius,
						pointHoverRadius,
						pointBackgroundColor: '#3b82f6',
						pointBorderWidth: 0
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				parsing: false,
				plugins: {
					legend: { display: false },
					tooltip: {
						enabled: true,
						displayColors: false,
						callbacks: {
							title: () => '',
							label: (item) => {
								const point = item.raw as ChartPoint | undefined;
								if (!point?.meta) return `$${Number(item.parsed?.y ?? 0).toFixed(2)}`;
								return [
									`Period: ${point.meta.cyclePeriod}`,
									`Payment Date: ${point.meta.paymentDates}`,
									`Amount: ${point.meta.amountLabel}`
								];
							}
						}
					}
				},
				scales: {
					x: {
						type: 'linear',
						min: xMin,
						max: xMax,
						grid: { display: false },
						title: {
							display: showXAxis,
							text: ''
						},
						border: {
							display: showXAxis
						},
						ticks: {
							stepSize: 1,
							display: showXAxisLabels,
							callback: (value) => `${value}`
						}
					},
					y: {
						min: yMin,
						max: yMax,
						grid: { color: 'rgba(0,0,0,0.06)' },
						title: {
							display: true,
							text: yLabel
						},
						ticks: {
							callback: (value) => `$${value}`
						}
					}
				}
			}
		});
	}

	$effect(() => {
		if (canvas) {
			renderChart();
		}
	});

	onMount(() => {
		renderChart();
	});

	onDestroy(() => {
		if (chart) chart.destroy();
	});
</script>

<div class="w-full" style={`height: ${height}px`}>
	<canvas bind:this={canvas}></canvas>
</div>
