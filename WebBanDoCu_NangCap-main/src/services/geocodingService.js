const mapsKey = () => String(process.env.GOOGLE_MAPS_API_KEY || '').trim();

async function geocodeAddress(address) {
    if (String(process.env.GEOCODING_ENABLED || 'true').toLowerCase() === 'false') return null;
    const key = mapsKey();
    const normalized = String(address || '').trim();
    if (!key || !normalized) return null;

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', normalized);
    url.searchParams.set('region', 'vn');
    url.searchParams.set('key', key);

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            console.warn(`Google Geocoding trả HTTP ${response.status}; tin này chưa được gắn tọa độ.`);
            return null;
        }
        const result = await response.json();
        if (result.status === 'ZERO_RESULTS') return null;
        if (result.status !== 'OK') {
            console.warn(`Google Geocoding không trả tọa độ (${result.status}); kiểm tra cấu hình API key.`);
            return null;
        }
        const { lat, lng } = result.results?.[0]?.geometry?.location || {};
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { latitude: lat, longitude: lng };
    } catch (error) {
        console.warn('Không thể gọi Google Geocoding; tin này chưa được gắn tọa độ:', error.message);
        return null;
    }
}

module.exports = { geocodeAddress };
