<script lang="ts">
	import ProgressIndicator from '$ui/arr/ProgressIndicator.svelte';
	import Tooltip from '$ui/tooltip/Tooltip.svelte';
	import type { SonarrScoreSummary } from '$utils/arr/types.ts';

	/** Undefined when the cached library predates score aggregation */
	export let score: SonarrScoreSummary | null | undefined;
	export let mode: 'compact' | 'inline' = 'compact';
	export let tooltipPosition: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

	function describe(summary: SonarrScoreSummary): string {
		const parts = [`Avg ${summary.averageScore.toLocaleString()} per episode`];
		if (summary.lowestScore !== null) {
			parts.push(`Lowest ${summary.lowestScore.toLocaleString()}`);
		}
		parts.push(
			`${summary.episodesMeetingCutoff}/${summary.scoredEpisodeCount} episodes at cutoff (${summary.cutoffScore.toLocaleString()})`
		);
		return parts.join(' · ');
	}
</script>

{#if score && score.scoredEpisodeCount > 0}
	<ProgressIndicator
		current={score.totalScore}
		target={score.targetScore}
		met={score.cutoffMet}
		{mode}
		tooltip={describe(score)}
		{tooltipPosition}
	/>
{:else if score}
	<span class="font-mono text-xs text-neutral-400 dark:text-neutral-500">-</span>
{:else}
	<Tooltip text="Episode scores unavailable, try refreshing the library" position={tooltipPosition}>
		<span class="font-mono text-xs text-neutral-400 dark:text-neutral-500">-</span>
	</Tooltip>
{/if}
