<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import ExportImportSection from '$lib/components/settings/ExportImportSection.svelte';
	import ResetDataSection from '$lib/components/settings/ResetDataSection.svelte';
	import ResetDataModal from '$lib/components/settings/ResetDataModal.svelte';
	import CategoriesSection from '$lib/components/settings/CategoriesSection.svelte';
	import CategoryFormModal from '$lib/components/settings/CategoryFormModal.svelte';
	import AssetTagsSection from '$lib/components/settings/AssetTagsSection.svelte';
	import AssetTagFormModal from '$lib/components/settings/AssetTagFormModal.svelte';
	import PaymentMethodsSection from '$lib/components/settings/PaymentMethodsSection.svelte';
	import PaymentMethodFormModal from '$lib/components/settings/PaymentMethodFormModal.svelte';
	import ThemeSelector from '$lib/components/ThemeSelector.svelte';
	import {
		Settings,
		Zap,
		ShieldCheck,
		Home,
		Receipt
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let showAddCategoryModal = $state(false);
	let showEditCategoryModal = $state(false);
	let showAddAssetTagModal = $state(false);
	let showEditAssetTagModal = $state(false);
	let showAddPaymentMethodModal = $state(false);
	let showEditPaymentMethodModal = $state(false);
	let showResetModal = $state(false);
	let editingCategoryId = $state<number | null>(null);
	let editingAssetTagId = $state<number | null>(null);
	let editingPaymentMethodId = $state<number | null>(null);

	type AssetTagType = '' | 'house' | 'vehicle';
	type AssetTagBannerPattern = 'solid' | 'stripes' | 'dots' | 'crosshatch';
	type PaymentMethodType = 'credit_card' | 'checking' | 'savings';

	let categoryForm = $state({
		name: '',
		color: '#3B82F6',
		icon: ''
	});
	let assetTagForm = $state<{
		name: string;
		type: AssetTagType;
		color: string;
		bannerPattern: AssetTagBannerPattern;
	}>({
		name: '',
		type: '',
		color: '#6b7280',
		bannerPattern: 'solid'
	});
	let paymentMethodForm = $state<{ nickname: string; lastFour: string; type: PaymentMethodType }>({
		nickname: '',
		lastFour: '',
		type: 'credit_card'
	});

	// Icon options for categories (preset set)
	const iconOptions = [
		{ id: 'utility', component: Zap, label: 'Utility' },
		{ id: 'insurance', component: ShieldCheck, label: 'Insurance' },
		{ id: 'mortgage', component: Home, label: 'Mortgage' },
		{ id: 'fee', component: Receipt, label: 'Fee' }
	];


	function openAddCategoryModal() {
		categoryForm = {
			name: '',
			color: '#3B82F6',
			icon: ''
		};
		showAddCategoryModal = true;
	}

	function openAddAssetTagModal() {
		assetTagForm = {
			name: '',
			type: 'house',
			color: '#10b981',
			bannerPattern: 'solid'
		};
		showAddAssetTagModal = true;
	}

	function openEditCategoryModal(id: number) {
		const category = data.categories.find((c) => c.id === id);
		if (category) {
			categoryForm = {
				name: category.name,
				color: category.color,
				icon: category.icon || ''
			};
			editingCategoryId = id;
			showEditCategoryModal = true;
		}
	}

	function openEditAssetTagModal(id: number) {
		const tag = data.assetTags.find((t) => t.id === id);
		if (tag) {
			assetTagForm = {
				name: tag.name,
				type: (tag.type as AssetTagType) || '',
				color: tag.color || '#6b7280',
				bannerPattern: (tag.bannerPattern as AssetTagBannerPattern) || 'solid'
			};
			editingAssetTagId = id;
			showEditAssetTagModal = true;
		}
	}

	async function handleAddCategory() {
		if (!categoryForm.name.trim()) {
			alert('Please enter a category name');
			return;
		}

		try {
			const response = await fetch('/api/categories', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(categoryForm)
			});

			if (response.ok) {
				showAddCategoryModal = false;
				await invalidateAll();
			} else {
				alert('Failed to create category. Please try again.');
			}
		} catch (error) {
			console.error('Error creating category:', error);
			alert('Failed to create category. Please try again.');
		}
	}

	async function handleAddAssetTag() {
		if (!assetTagForm.name.trim()) {
			alert('Please enter a tag name');
			return;
		}

		try {
			const response = await fetch('/api/asset-tags', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: assetTagForm.name,
					type: assetTagForm.type || null,
					color: assetTagForm.color || null,
					bannerPattern: assetTagForm.bannerPattern
				})
			});

			if (response.ok) {
				showAddAssetTagModal = false;
				await invalidateAll();
			} else {
				alert('Failed to create asset tag. Please try again.');
			}
		} catch (error) {
			console.error('Error creating asset tag:', error);
			alert('Failed to create asset tag. Please try again.');
		}
	}

	async function handleUpdateCategory() {
		if (!categoryForm.name.trim() || editingCategoryId === null) {
			alert('Please enter a category name');
			return;
		}

		try {
			const response = await fetch(`/api/categories/${editingCategoryId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(categoryForm)
			});

			if (response.ok) {
				showEditCategoryModal = false;
				editingCategoryId = null;
				await invalidateAll();
			} else {
				alert('Failed to update category. Please try again.');
			}
		} catch (error) {
			console.error('Error updating category:', error);
			alert('Failed to update category. Please try again.');
		}
	}

	async function handleUpdateAssetTag() {
		if (!assetTagForm.name.trim() || editingAssetTagId === null) {
			alert('Please enter a tag name');
			return;
		}

		try {
			const response = await fetch(`/api/asset-tags/${editingAssetTagId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: assetTagForm.name,
					type: assetTagForm.type || null,
					color: assetTagForm.color || null,
					bannerPattern: assetTagForm.bannerPattern
				})
			});

			if (response.ok) {
				showEditAssetTagModal = false;
				editingAssetTagId = null;
				await invalidateAll();
			} else {
				alert('Failed to update asset tag. Please try again.');
			}
		} catch (error) {
			console.error('Error updating asset tag:', error);
			alert('Failed to update asset tag. Please try again.');
		}
	}

	async function handleDeleteCategory(id: number, name: string) {
		if (
			!confirm(
				`Are you sure you want to delete the category "${name}"? This will set all bills in this category to "Uncategorized".`
			)
		) {
			return;
		}

		try {
			const response = await fetch(`/api/categories/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidateAll();
			} else {
				alert('Failed to delete category. Please try again.');
			}
		} catch (error) {
			console.error('Error deleting category:', error);
			alert('Failed to delete category. Please try again.');
		}
	}

	async function handleDeleteAssetTag(id: number, name: string) {
		if (
			!confirm(
				`Are you sure you want to delete the asset tag "${name}"? This will remove the tag from any bills using it.`
			)
		) {
			return;
		}

		try {
			const response = await fetch(`/api/asset-tags/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidateAll();
			} else {
				alert('Failed to delete asset tag. Please try again.');
			}
		} catch (error) {
			console.error('Error deleting asset tag:', error);
			alert('Failed to delete asset tag. Please try again.');
		}
	}

	async function handleAddPaymentMethod() {
		if (!paymentMethodForm.nickname.trim() || !paymentMethodForm.lastFour.trim()) {
			alert('Please enter a nickname and last 4 digits');
			return;
		}
		if (!/^\d{4}$/.test(paymentMethodForm.lastFour)) {
			alert('Please enter exactly 4 digits for the last 4');
			return;
		}

		try {
			const response = await fetch('/api/payment-methods', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					nickname: paymentMethodForm.nickname,
					lastFour: paymentMethodForm.lastFour,
					type: paymentMethodForm.type || null
				})
			});

			if (response.ok) {
				showAddPaymentMethodModal = false;
				await invalidateAll();
			} else {
				alert('Failed to create payment method. Please try again.');
			}
		} catch (error) {
			console.error('Error creating payment method:', error);
			alert('Failed to create payment method. Please try again.');
		}
	}

	async function handleUpdatePaymentMethod() {
		if (!paymentMethodForm.nickname.trim() || !paymentMethodForm.lastFour.trim() || editingPaymentMethodId === null) {
			alert('Please enter a nickname and last 4 digits');
			return;
		}
		if (!/^\d{4}$/.test(paymentMethodForm.lastFour)) {
			alert('Please enter exactly 4 digits for the last 4');
			return;
		}

		try {
			const response = await fetch(`/api/payment-methods/${editingPaymentMethodId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					nickname: paymentMethodForm.nickname,
					lastFour: paymentMethodForm.lastFour,
					type: paymentMethodForm.type || null
				})
			});

			if (response.ok) {
				showEditPaymentMethodModal = false;
				editingPaymentMethodId = null;
				await invalidateAll();
			} else {
				alert('Failed to update payment method. Please try again.');
			}
		} catch (error) {
			console.error('Error updating payment method:', error);
			alert('Failed to update payment method. Please try again.');
		}
	}

	async function handleDeletePaymentMethod(id: number, nickname: string) {
		if (!confirm(`Are you sure you want to delete "${nickname}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/payment-methods/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidateAll();
			} else {
				alert('Failed to delete payment method. Please try again.');
			}
		} catch (error) {
			console.error('Error deleting payment method:', error);
			alert('Failed to delete payment method. Please try again.');
		}
	}

	function openAddPaymentMethodModal() {
		paymentMethodForm = {
			nickname: '',
			lastFour: '',
			type: 'credit_card'
		};
		showAddPaymentMethodModal = true;
	}

	function openEditPaymentMethodModal(id: number) {
		const method = data.paymentMethods.find((m) => m.id === id);
		if (method) {
			paymentMethodForm = {
				nickname: method.nickname,
				lastFour: method.lastFour,
				type: method.type || 'credit_card'
			};
			editingPaymentMethodId = id;
			showEditPaymentMethodModal = true;
		}
	}


	async function handleExport() {
		try {
			window.location.href = '/api/export';
		} catch (error) {
			console.error('Export error:', error);
			alert('Failed to export data. Please try again.');
		}
	}

	const groupClass =
		'rounded-3xl border border-gray-200 bg-white/90 p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/85 sm:p-6';
</script>

<svelte:head>
	<title>Settings - BillTrack</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-10">
		<div class="flex items-center gap-3">
			<Settings class="h-8 w-8 text-gray-900 dark:text-gray-100" />
			<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
		</div>
		<p class="mt-2 text-gray-600 dark:text-gray-400">
			Control how BillTrack looks, how bills are organized, and how your data is protected.
		</p>
	</div>

	<div class="space-y-8">
		<section class={groupClass}>
			<div class="mb-5">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Appearance</p>
				<h2 class="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">How the app feels</h2>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Set the visual mode you want BillTrack to use across the app.
				</p>
			</div>
			<div class="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-700 dark:bg-gray-900/30">
				<ThemeSelector />
			</div>
		</section>

		<section class={groupClass}>
			<div class="mb-5">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Payment Setup</p>
				<h2 class="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">Autopay and funding sources</h2>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Keep the payment methods that recurring bills can reference for autopay.
				</p>
			</div>
			<PaymentMethodsSection
				paymentMethods={data.paymentMethods}
				onAdd={openAddPaymentMethodModal}
				onEdit={openEditPaymentMethodModal}
				onDelete={handleDeletePaymentMethod}
			/>
		</section>

		<section class={groupClass}>
			<div class="mb-5">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Bill Metadata</p>
				<h2 class="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">How bills are labeled</h2>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Manage the labels and groupings that help you organize bills in the dashboard and detail pages.
				</p>
			</div>
			<div class="space-y-8">
				<CategoriesSection
					categories={data.categories}
					{iconOptions}
					onAdd={openAddCategoryModal}
					onEdit={openEditCategoryModal}
					onDelete={handleDeleteCategory}
				/>

				<AssetTagsSection
					assetTags={data.assetTags}
					onAdd={openAddAssetTagModal}
					onEdit={openEditAssetTagModal}
					onDelete={handleDeleteAssetTag}
				/>
			</div>
		</section>

		<section class={groupClass}>
			<div class="mb-5">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Data Management</p>
				<h2 class="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">Backup, restore, and reset</h2>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Protect your data with exports, restore from backups when needed, and keep destructive tools isolated.
				</p>
			</div>
			<div class="space-y-8">
				<ExportImportSection onExport={handleExport} />

				<ResetDataSection onReset={() => (showResetModal = true)} />
			</div>
		</section>
	</div>
</div>

<!-- Add Category Modal -->
<CategoryFormModal
	bind:isOpen={showAddCategoryModal}
	mode="add"
	bind:categoryForm
	{iconOptions}
	onSubmit={handleAddCategory}
	onCancel={() => (showAddCategoryModal = false)}
/>

<!-- Edit Category Modal -->
<CategoryFormModal
	bind:isOpen={showEditCategoryModal}
	mode="edit"
	bind:categoryForm
	{iconOptions}
	onSubmit={handleUpdateCategory}
	onCancel={() => {
		showEditCategoryModal = false;
		editingCategoryId = null;
	}}
/>

<!-- Add Asset Tag Modal -->
<AssetTagFormModal
	bind:isOpen={showAddAssetTagModal}
	mode="add"
	bind:assetTagForm
	onSubmit={handleAddAssetTag}
	onCancel={() => (showAddAssetTagModal = false)}
/>

<!-- Edit Asset Tag Modal -->
<AssetTagFormModal
	bind:isOpen={showEditAssetTagModal}
	mode="edit"
	bind:assetTagForm
	onSubmit={handleUpdateAssetTag}
	onCancel={() => {
		showEditAssetTagModal = false;
		editingAssetTagId = null;
	}}
/>

<!-- Add Payment Method Modal -->
<PaymentMethodFormModal
	bind:isOpen={showAddPaymentMethodModal}
	mode="add"
	bind:paymentMethodForm
	onSubmit={handleAddPaymentMethod}
	onCancel={() => (showAddPaymentMethodModal = false)}
/>

<!-- Edit Payment Method Modal -->
<PaymentMethodFormModal
	bind:isOpen={showEditPaymentMethodModal}
	mode="edit"
	bind:paymentMethodForm
	onSubmit={handleUpdatePaymentMethod}
	onCancel={() => {
		showEditPaymentMethodModal = false;
		editingPaymentMethodId = null;
	}}
/>

<!-- Reset Data Modal -->
<ResetDataModal bind:isOpen={showResetModal} onClose={() => (showResetModal = false)} />
