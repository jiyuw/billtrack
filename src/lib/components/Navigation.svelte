<script lang="ts">
	import { page } from '$app/stores';
	import { Activity, Building2, LayoutDashboard, Settings, TrendingUp } from 'lucide-svelte';
	import favicon from '$lib/assets/favicon.svg';

	let {
		appVersion,
		rentalManagementEnabled = false
	}: { appVersion: string; rentalManagementEnabled?: boolean } = $props();

	const isActive = (path: string) => $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');

	const navItems = [
		{ href: '/', label: 'Bills', icon: LayoutDashboard },
		{ href: '/analytics', label: 'Analytics', icon: TrendingUp },
		...(rentalManagementEnabled ? [{ href: '/rentals', label: 'Rentals', icon: Building2 }] : []),
		{ href: '/activity', label: 'Activity', icon: Activity },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];
</script>

<nav class="sticky top-0 z-40 hidden border-b border-gray-200/80 bg-white/92 backdrop-blur dark:border-gray-700/80 dark:bg-gray-800/92 md:block">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex min-h-[76px] items-center justify-between gap-6 py-4">
				<div class="flex items-center gap-6">
					<a href="/" class="group flex items-center gap-2">
						<img src={favicon} alt="" class="h-7 w-7" />
						<p class="text-lg font-semibold text-gray-900 transition-colors group-hover:text-gray-700 dark:text-gray-100 dark:group-hover:text-gray-300">BillTrack</p>
					</a>

					<div class="hidden items-center gap-2 lg:flex">
						{#each navItems as item}
							<a
								href={item.href}
								class={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
									isActive(item.href)
										? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
										: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
								}`}
							>
								<item.icon class="h-4 w-4" />
								<span>{item.label}</span>
							</a>
						{/each}
					</div>
				</div>

				<div class="flex items-center gap-3">
					<div class="hidden px-1 text-sm font-semibold tracking-[0.08em] text-gray-400 dark:text-gray-500 sm:block">
						v{appVersion}
					</div>
					<div class="flex items-center gap-1 lg:hidden">
						{#each navItems as item}
							<a
								href={item.href}
								class={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
									isActive(item.href)
										? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
										: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
								}`}
								title={item.label}
							>
								<item.icon class="h-4 w-4" />
							</a>
						{/each}
					</div>
				</div>
		</div>
	</div>
</nav>
