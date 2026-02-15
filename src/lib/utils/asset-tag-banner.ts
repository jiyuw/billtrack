type AssetTagPattern = 'solid' | 'stripes' | 'dots' | 'crosshatch';

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
	const normalized = color.trim().replace('#', '');
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
	const value = parseInt(normalized, 16);
	return {
		r: (value >> 16) & 255,
		g: (value >> 8) & 255,
		b: value & 255
	};
}

export function getAssetTagBannerStyle(
	color?: string | null,
	pattern?: string | null
): string {
	const baseColor = color || '#64748b';
	const rgb = hexToRgb(baseColor);
	if (!rgb) {
		return `background-color: ${baseColor};`;
	}

	const patternKey: AssetTagPattern =
		pattern === 'stripes' || pattern === 'dots' || pattern === 'crosshatch'
			? pattern
			: pattern === 'grid'
				? 'crosshatch'
				: 'solid';

	if (patternKey === 'solid') {
		return `background-color: ${baseColor};`;
	}

	const overlay =
		patternKey === 'stripes'
			? `repeating-linear-gradient(135deg, rgba(255,255,255,0.32) 0 2px, rgba(255,255,255,0.05) 2px 8px)`
			: patternKey === 'dots'
				? `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.4) 1.2px, transparent 1.3px)`
				: `repeating-linear-gradient(45deg, rgba(255,255,255,0.24) 0 6px, rgba(255,255,255,0.08) 6px 12px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.24) 0 6px, rgba(255,255,255,0.08) 6px 12px)`;

	const size = patternKey === 'dots' ? '10px 10px' : patternKey === 'crosshatch' ? '14px 14px' : '12px 12px';
	return `background-color: rgb(${rgb.r}, ${rgb.g}, ${rgb.b}); background-image: ${overlay}; background-size: ${size};`;
}
