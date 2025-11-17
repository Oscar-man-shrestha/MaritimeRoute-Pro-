// Configuration
const CONFIG = {
    AVERAGE_SPEED_KMH: 37.0,
    FUEL_CONSUMPTION_PER_KM: 0.04,
    WEATHER_FACTOR: 1.25,
    EMISSION_FACTOR: 3.15
};

let map;
let routeLayers = {
    fastest: null,
    fuel: null,
    direct: null
};
let portMarkers = [];
let currentMapData = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupEventListeners();
    // Show legend immediately
    document.getElementById('mapLegend').style.display = 'block';
});

function initializeMap() {
    // Initialize map centered on world
    map = L.map('map').setView([20, 0], 2);
    
    // Add base layers
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    // Add OpenSeaMap layer
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: '© OpenSeaMap contributors',
        maxZoom: 18,
        opacity: 0.7
    }).addTo(map);

    // Add initial instruction popup
    const instructionPopup = L.popup()
        .setLatLng([20, 0])
        .setContent(`
            <div style="text-align: center; padding: 10px;">
                <h3>🚢 Shipping Route Optimizer</h3>
                <p>Select ports and click "Calculate Optimal Routes" to see shipping routes on the map.</p>
                <p><strong>Try selecting hub ports to see different route options!</strong></p>
            </div>
        `)
        .openOn(map);
}

function setupEventListeners() {
    document.getElementById('calculateBtn').addEventListener('click', calculateRoutes);
    
    // Add event listeners for port selection to show suggestions
    document.getElementById('startPort').addEventListener('change', showRouteSuggestions);
    document.getElementById('destinationPort').addEventListener('change', showRouteSuggestions);
    
    // Add event listener for intermediate ports selection
    document.getElementById('hubPorts').addEventListener('change', updateSelectedPortsDisplay);
}

function showRouteSuggestions() {
    const startPort = document.getElementById('startPort').value;
    const destinationPort = document.getElementById('destinationPort').value;
    
    if (startPort && destinationPort && startPort !== destinationPort) {
        console.log(`Route: ${startPort} → ${destinationPort}`);
    }
}

function updateSelectedPortsDisplay() {
    const hubPortsSelect = document.getElementById('hubPorts');
    const selectedPortsContainer = document.getElementById('selectedPorts');
    const selectedPortsList = document.getElementById('selectedPortsList');
    
    const selectedOptions = Array.from(hubPortsSelect.selectedOptions);
    const selectedPorts = selectedOptions.map(opt => opt.value).filter(port => port !== "");
    
    console.log('Selected intermediate ports:', selectedPorts);
    
    if (selectedPorts.length > 0) {
        selectedPortsContainer.style.display = 'block';
        selectedPortsList.innerHTML = '';
        
        selectedPorts.forEach(port => {
            const portTag = document.createElement('div');
            portTag.className = 'port-tag selected';
            portTag.innerHTML = `
                ${port}
                <button type="button" class="port-tag-remove" onclick="removePortFromSelection('${port}')">×</button>
            `;
            selectedPortsList.appendChild(portTag);
        });
    } else {
        selectedPortsContainer.style.display = 'none';
    }
}

function removePortFromSelection(port) {
    const hubPortsSelect = document.getElementById('hubPorts');
    const option = Array.from(hubPortsSelect.options).find(opt => opt.value === port);
    
    if (option) {
        option.selected = false;
        updateSelectedPortsDisplay();
    }
}

function clearSelectedPorts() {
    const hubPortsSelect = document.getElementById('hubPorts');
    Array.from(hubPortsSelect.options).forEach(option => {
        option.selected = false;
    });
    updateSelectedPortsDisplay();
}

function clearForm() {
    document.getElementById('startPort').value = '';
    document.getElementById('destinationPort').value = '';
    
    // Clear multiple select
    clearSelectedPorts();
    
    // Reset radio buttons
    document.querySelector('input[name="goal"][value="both"]').checked = true;
    
    // Hide results
    document.getElementById('resultsPanel').style.display = 'none';
    
    // Clear map
    Object.values(routeLayers).forEach(layer => {
        if (layer) map.removeLayer(layer);
    });
    
    portMarkers.forEach(marker => map.removeLayer(marker));
    portMarkers = [];
    
    // Reset map view
    map.setView([20, 0], 2);
}

async function calculateRoutes() {
    const startPort = document.getElementById('startPort').value;
    const destinationPort = document.getElementById('destinationPort').value;
    const hubPortsSelect = document.getElementById('hubPorts');
    const hubPorts = Array.from(hubPortsSelect.selectedOptions).map(opt => opt.value).filter(port => port !== "");
    const goal = document.querySelector('input[name="goal"]:checked').value;
    
    console.log('🚢 Sending to backend:', {
        startPort,
        destinationPort,
        hubPorts,
        goal,
        hubPortsCount: hubPorts.length
    });
    
    // Validate inputs
    if (!startPort || !destinationPort) {
        alert('Please select both start and destination ports');
        return;
    }
    
    if (startPort === destinationPort) {
        alert('Start and destination ports cannot be the same');
        return;
    }
    
    // Show loading
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('calculateBtn').disabled = true;
    
    try {
        const response = await fetch('/calculate-routes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start_port: startPort,
                destination_port: destinationPort,
                hub_ports: hubPorts,
                goal: goal
            })
        });
        
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        console.log('✅ Received from backend:', data);
        console.log('🔍 Fastest route ports:', data.fastest_route?.ports);
        console.log('🔍 Fuel route ports:', data.fuel_efficient_route?.ports);
        console.log('🔍 Intermediate ports sent:', hubPorts);
        console.log('🔍 Intermediate ports in routes:', {
            inFastest: data.fastest_route?.ports?.filter(port => hubPorts.includes(port)),
            inFuel: data.fuel_efficient_route?.ports?.filter(port => hubPorts.includes(port))
        });
        
        currentMapData = data;
        displayResults(data);
        displayRoutesOnMap(data);
        
    } catch (error) {
        console.error('❌ Error calculating routes:', error);
        alert('Error calculating routes: ' + error.message);
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('calculateBtn').disabled = false;
    }
}

// ... rest of your existing JavaScript functions (safeNumberFormat, displayResults, displayRoutesOnMap, etc.)
// Keep all the other functions the same as in the previous version
// Safe number formatting function
function safeNumberFormat(value, decimals = 2) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'N/A';
    }
    return Number(value).toFixed(decimals);
}

function displayResults(data) {
    const resultsPanel = document.getElementById('resultsPanel');
    const comparisonDiv = resultsPanel.querySelector('.route-comparison');
    
    resultsPanel.style.display = 'block';
    
    // Safe data access with defaults
    const fastestRoute = data.fastest_route || {};
    const fuelRoute = data.fuel_efficient_route || {};
    
    const fastestPorts = fastestRoute.ports || [];
    const fuelPorts = fuelRoute.ports || [];
    
    // Get selected intermediate ports
    const hubPortsSelect = document.getElementById('hubPorts');
    const selectedHubs = Array.from(hubPortsSelect.selectedOptions).map(opt => opt.value).filter(port => port !== "");
    
    const hasHubs = fastestPorts.length > 2 || fuelPorts.length > 2;
    const routesAreDifferent = JSON.stringify(fastestPorts) !== JSON.stringify(fuelPorts);
    
    // Calculate differences for comparison
    let comparisonHTML = '';
    if (routesAreDifferent && fastestRoute && fuelRoute) {
        const timeDiff = (fuelRoute.time_hours || 0) - (fastestRoute.time_hours || 0);
        const fuelDiff = (fastestRoute.fuel_tonnes || 0) - (fuelRoute.fuel_tonnes || 0);
        const co2Diff = (fastestRoute.co2_tonnes || 0) - (fuelRoute.co2_tonnes || 0);
        
        if (fuelDiff !== 0 || timeDiff !== 0) {
            comparisonHTML = `
                <div class="savings-info">
                    <p>
                        <strong>Route Comparison:</strong> 
                        ${fuelDiff > 0 ? 
                            `The efficient route saves ${safeNumberFormat(fuelDiff, 1)} tonnes of fuel` : 
                            fuelDiff < 0 ? 
                            `The fastest route uses ${safeNumberFormat(Math.abs(fuelDiff), 1)} fewer tonnes of fuel` :
                            `Both routes use the same fuel`
                        }
                        ${co2Diff !== 0 ? 
                            ` and ${co2Diff > 0 ? 
                                `reduces CO₂ by ${safeNumberFormat(co2Diff, 1)} tonnes` : 
                                `increases CO₂ by ${safeNumberFormat(Math.abs(co2Diff), 1)} tonnes`
                            }` : 
                            ` with no CO₂ difference`
                        }
                        ${timeDiff !== 0 ? 
                            ` while ${timeDiff > 0 ? 
                                `adding ${safeNumberFormat(timeDiff/24, 1)} days` : 
                                `saving ${safeNumberFormat(Math.abs(timeDiff/24), 1)} days`
                            } to the journey.` : 
                            ` with no time difference.`
                        }
                    </p>
                </div>
            `;
        }
    }
    
    // Show intermediate ports usage info
    let intermediateInfoHTML = '';
    
    if (selectedHubs.length > 0) {
        const usedInFastest = selectedHubs.filter(hub => fastestPorts.includes(hub));
        const usedInFuel = selectedHubs.filter(hub => fuelPorts.includes(hub));
        
        // Show which intermediate ports are actually used in the routes
        intermediateInfoHTML = `
            <div class="route-suggestion">
                <h4>🔄 Intermediate Ports Analysis</h4>
                <div class="intermediate-stats">
                    <div class="intermediate-stat">
                        <strong>Selected:</strong> ${selectedHubs.join(', ')}
                    </div>
                    <div class="intermediate-stat ${usedInFastest.length === selectedHubs.length ? 'all-used' : 'partial-used'}">
                        <strong>Fastest Route uses:</strong> ${usedInFastest.length}/${selectedHubs.length} ports
                        ${usedInFastest.length > 0 ? `(${usedInFastest.join(', ')})` : 'None used'}
                    </div>
                    <div class="intermediate-stat ${usedInFuel.length === selectedHubs.length ? 'all-used' : 'partial-used'}">
                        <strong>Efficient Route uses:</strong> ${usedInFuel.length}/${selectedHubs.length} ports
                        ${usedInFuel.length > 0 ? `(${usedInFuel.join(', ')})` : 'None used'}
                    </div>
                </div>
                ${usedInFastest.length < selectedHubs.length || usedInFuel.length < selectedHubs.length ? `
                <p class="intermediate-note">💡 <em>Note: Not all selected ports are used. The algorithm optimizes for the best route and may skip some ports if they don't improve the journey.</em></p>
                ` : ''}
            </div>
        `;
    }
    
    // Create route visualization with highlights
    function formatRoutePath(ports, selectedHubs) {
        return ports.map((port, index) => {
            if (index === 0) return `<span class="port-start">${port}</span>`;
            if (index === ports.length - 1) return `<span class="port-end">${port}</span>`;
            if (selectedHubs.includes(port)) return `<span class="port-hub used">${port}</span>`;
            return `<span class="port-hub">${port}</span>`;
        }).join(' → ');
    }
    
    comparisonDiv.innerHTML = `
        ${!hasHubs && selectedHubs.length === 0 ? `
        <div class="route-suggestion">
            <p>💡 <strong>Tip:</strong> Select intermediate ports to see different route options!</p>
        </div>
        ` : ''}
        
        ${intermediateInfoHTML}
        
        <div class="route-cards">
            <div class="route-card fastest">
                <div class="route-card-header">
                    <span class="route-icon">🚀</span>
                    <span class="route-title">Fastest Route</span>
                    ${fastestPorts.length > 2 ? '<span class="route-badge">With Intermediate Ports</span>' : '<span class="route-badge">Direct Route</span>'}
                </div>
                <div class="route-path">
                    <strong>Path:</strong> 
                    <div class="route-visualization">
                        ${formatRoutePath(fastestPorts, selectedHubs)}
                    </div>
                    ${fastestPorts.length > 2 ? `
                    <div class="route-stops">
                        <small>🛑 ${fastestPorts.length - 2} intermediate stop${fastestPorts.length - 2 !== 1 ? 's' : ''}</small>
                    </div>
                    ` : ''}
                </div>
                <div class="route-stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fastestRoute.distance_km)} km</div>
                        <div class="stat-label">Distance</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat((fastestRoute.time_hours || 0) / 24, 1)} days</div>
                        <div class="stat-label">Time</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fastestRoute.fuel_tonnes, 1)} tonnes</div>
                        <div class="stat-label">Fuel</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fastestRoute.co2_tonnes, 1)} tonnes</div>
                        <div class="stat-label">CO₂ Emissions</div>
                    </div>
                </div>
            </div>
            
            <div class="route-card fuel-efficient">
                <div class="route-card-header">
                    <span class="route-icon">🌿</span>
                    <span class="route-title">Fuel-Efficient Route</span>
                    ${fuelPorts.length > 2 ? '<span class="route-badge">With Intermediate Ports</span>' : '<span class="route-badge">Direct Route</span>'}
                </div>
                <div class="route-path">
                    <strong>Path:</strong> 
                    <div class="route-visualization">
                        ${formatRoutePath(fuelPorts, selectedHubs)}
                    </div>
                    ${fuelPorts.length > 2 ? `
                    <div class="route-stops">
                        <small>🛑 ${fuelPorts.length - 2} intermediate stop${fuelPorts.length - 2 !== 1 ? 's' : ''}</small>
                    </div>
                    ` : ''}
                </div>
                <div class="route-stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fuelRoute.distance_km)} km</div>
                        <div class="stat-label">Distance</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat((fuelRoute.time_hours || 0) / 24, 1)} days</div>
                        <div class="stat-label">Time</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fuelRoute.fuel_tonnes, 1)} tonnes</div>
                        <div class="stat-label">Fuel</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fuelRoute.co2_tonnes, 1)} tonnes</div>
                        <div class="stat-label">CO₂ Emissions</div>
                    </div>
                </div>
            </div>
        </div>
        
        ${comparisonHTML}
        
        ${!routesAreDifferent && hasHubs ? `
        <div class="savings-info">
            <p>ℹ️ <strong>Note:</strong> Both routes are identical with the current port selection. Try different intermediate ports to see route variations.</p>
        </div>
        ` : ''}
        
        ${selectedHubs.length > 0 && (fastestPorts.length > 2 || fuelPorts.length > 2) ? `
        <div class="route-suggestion">
            <h4>🎯 How Intermediate Ports Work</h4>
            <p>The algorithm finds the optimal sequence of ports to visit between your start and destination. 
            It considers factors like distance, shipping lanes, and efficiency to determine which intermediate ports 
            to include and in what order.</p>
            <p><strong>Example:</strong> If you select Singapore, Jebel_Ali, and Mumbai between Colombo and Jakarta, 
            the algorithm might choose Colombo → Singapore → Jakarta (skipping others) if that's the fastest path.</p>
        </div>
        ` : ''}
    `;
    
    // Update results meta
    const resultsMeta = document.getElementById('resultsMeta');
    if (fastestPorts.length > 0 && fuelPorts.length > 0) {
        const totalPorts = new Set([...fastestPorts, ...fuelPorts]).size;
        const maxDistance = Math.max(fastestRoute.distance_km || 0, fuelRoute.distance_km || 0);
        const hubCount = Math.max(fastestPorts.length - 2, fuelPorts.length - 2, 0);
        
        if (hubCount > 0) {
            resultsMeta.textContent = `${totalPorts} ports • ${hubCount} hubs • ${safeNumberFormat(maxDistance / 1000, 1)}k km`;
        } else {
            resultsMeta.textContent = `${totalPorts} ports • ${safeNumberFormat(maxDistance / 1000, 1)}k km`;
        }
    } else {
        resultsMeta.textContent = 'Calculating...';
    }
}





function displayRoutesOnMap(data) {
    // Clear existing routes and markers
    Object.values(routeLayers).forEach(layer => {
        if (layer) map.removeLayer(layer);
    });
    
    portMarkers.forEach(marker => map.removeLayer(marker));
    portMarkers = [];
    
    // Show legend
    document.getElementById('mapLegend').style.display = 'block';
    
    // Safe data access
    const fastestRoute = data.fastest_route || {};
    const fuelRoute = data.fuel_efficient_route || {};
    const directRoute = data.direct_route || {};
    
    // Add fastest route (orange)
    if (fastestRoute.coordinates && fastestRoute.coordinates.length > 0) {
        routeLayers.fastest = L.polyline(fastestRoute.coordinates, {
            color: '#ff6b35',
            weight: 5,
            opacity: 0.8,
            smoothFactor: 1
        }).addTo(map);
        
        routeLayers.fastest.bindPopup(`
            <div style="text-align: center;">
                <strong>🚀 Fastest Route</strong><br>
                ${(fastestRoute.ports || []).join(' → ')}<br>
                Distance: ${safeNumberFormat(fastestRoute.distance_km)} km<br>
                Time: ${safeNumberFormat((fastestRoute.time_hours || 0) / 24, 1)} days<br>
                Fuel: ${safeNumberFormat(fastestRoute.fuel_tonnes, 1)} tonnes
            </div>
        `);
    }
    
    // Add fuel-efficient route (green)
    if (fuelRoute.coordinates && fuelRoute.coordinates.length > 0) {
        routeLayers.fuel = L.polyline(fuelRoute.coordinates, {
            color: '#2ecc71',
            weight: 5,
            opacity: 0.8,
            smoothFactor: 1
        }).addTo(map);
        
        routeLayers.fuel.bindPopup(`
            <div style="text-align: center;">
                <strong>🌿 Fuel-Efficient Route</strong><br>
                ${(fuelRoute.ports || []).join(' → ')}<br>
                Distance: ${safeNumberFormat(fuelRoute.distance_km)} km<br>
                Time: ${safeNumberFormat((fuelRoute.time_hours || 0) / 24, 1)} days<br>
                Fuel: ${safeNumberFormat(fuelRoute.fuel_tonnes, 1)} tonnes
            </div>
        `);
    }
    
    // Add direct route (blue, dashed)
    if (directRoute.coordinates && directRoute.coordinates.length > 0) {
        routeLayers.direct = L.polyline(directRoute.coordinates, {
            color: '#3498db',
            weight: 3,
            opacity: 0.6,
            dashArray: '10, 10',
            smoothFactor: 1
        }).addTo(map);
        
        const startPort = fastestRoute.ports ? fastestRoute.ports[0] : 'Start';
        const endPort = fastestRoute.ports ? fastestRoute.ports[fastestRoute.ports.length - 1] : 'End';
        
        routeLayers.direct.bindPopup(`
            <div style="text-align: center;">
                <strong>📏 Direct Great Circle Route</strong><br>
                ${startPort} → ${endPort}<br>
                Distance: ${safeNumberFormat(directRoute.distance_km)} km
            </div>
        `);
    }
    
    // Add port markers
    if (data.port_locations) {
        const fastestPorts = fastestRoute.ports || [];
        const fuelPorts = fuelRoute.ports || [];
        addPortMarkers(data.port_locations, fastestPorts, fuelPorts);
    }
    
    // Fit map to show all routes with padding
    zoomToRoutes();
}

function addPortMarkers(portLocations, fastestPorts, fuelPorts) {
    Object.entries(portLocations).forEach(([port, coords]) => {
        let color = '#94a3b8'; // gray
        let iconHtml = '⚓';
        let popupClass = 'other-port';
        
        if (port === fastestPorts[0]) {
            color = '#27ae60'; // darkgreen
            iconHtml = '🟢';
            popupClass = 'start-port';
        } else if (port === fastestPorts[fastestPorts.length - 1]) {
            color = '#e74c3c'; // darkred
            iconHtml = '🔴';
            popupClass = 'destination-port';
        } else if (fastestPorts.includes(port) && fuelPorts.includes(port)) {
            color = '#9b59b6'; // purple
            iconHtml = '🟣';
            popupClass = 'shared-hub';
        } else if (fastestPorts.includes(port)) {
            color = '#ff6b35'; // orange
            iconHtml = '🟠';
            popupClass = 'fastest-hub';
        } else if (fuelPorts.includes(port)) {
            color = '#2ecc71'; // green
            iconHtml = '🟢';
            popupClass = 'fuel-hub';
        }
        
        // Create custom icon
        const customIcon = L.divIcon({
            html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${iconHtml}</div>`,
            className: 'custom-port-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        const marker = L.marker(coords, { icon: customIcon })
            .bindPopup(`
                <div style="text-align: center;" class="${popupClass}">
                    <strong>${port}</strong><br>
                    Lat: ${safeNumberFormat(coords[0], 4)}<br>
                    Lon: ${safeNumberFormat(coords[1], 4)}<br>
                    ${port === fastestPorts[0] ? '<em>Start Port</em>' : ''}
                    ${port === fastestPorts[fastestPorts.length - 1] ? '<em>Destination Port</em>' : ''}
                    ${fastestPorts.includes(port) && port !== fastestPorts[0] && port !== fastestPorts[fastestPorts.length - 1] ? '<em>Route Hub</em>' : ''}
                </div>
            `)
            .addTo(map);
        
        portMarkers.push(marker);
    });
}

function toggleRoute(routeType) {
    const layer = routeLayers[routeType];
    const buttons = document.querySelectorAll('.control-btn');
    
    if (layer) {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
            // Update button active state
            buttons.forEach(btn => {
                if (btn.textContent.includes(
                    routeType === 'fastest' ? 'Fastest' : 
                    routeType === 'fuel' ? 'Efficient' : 'Direct'
                )) {
                    btn.classList.remove('active');
                }
            });
        } else {
            layer.addTo(map);
            // Update button active state
            buttons.forEach(btn => {
                if (btn.textContent.includes(
                    routeType === 'fastest' ? 'Fastest' : 
                    routeType === 'fuel' ? 'Efficient' : 'Direct'
                )) {
                    btn.classList.add('active');
                }
            });
        }
    }
}

function toggleAllRoutes() {
    const routes = ['fastest', 'fuel', 'direct'];
    const allVisible = routes.every(route => 
        routeLayers[route] && map.hasLayer(routeLayers[route])
    );
    
    routes.forEach(route => {
        const layer = routeLayers[route];
        if (layer) {
            if (allVisible) {
                map.removeLayer(layer);
            } else {
                layer.addTo(map);
            }
        }
    });
    
    // Update button states
    const buttons = document.querySelectorAll('.control-btn');
    buttons.forEach(btn => {
        if (allVisible) {
            btn.classList.remove('active');
        } else {
            btn.classList.add('active');
        }
    });
}

function zoomToRoutes() {
    if (!currentMapData) return;
    
    const allCoords = [];
    
    // Collect coordinates from all routes
    if (currentMapData.fastest_route && currentMapData.fastest_route.coordinates) {
        allCoords.push(...currentMapData.fastest_route.coordinates);
    }
    if (currentMapData.fuel_efficient_route && currentMapData.fuel_efficient_route.coordinates) {
        allCoords.push(...currentMapData.fuel_efficient_route.coordinates);
    }
    if (currentMapData.direct_route && currentMapData.direct_route.coordinates) {
        allCoords.push(...currentMapData.direct_route.coordinates);
    }
    
    // Add port coordinates
    if (currentMapData.port_locations) {
        Object.values(currentMapData.port_locations).forEach(coords => {
            allCoords.push(coords);
        });
    }
    
    if (allCoords.length > 0) {
        const bounds = L.latLngBounds(allCoords);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

function toggleLegend() {
    const legendContent = document.querySelector('.legend-content');
    const legendToggle = document.querySelector('.legend-toggle');
    
    if (legendContent.style.display === 'none') {
        legendContent.style.display = 'flex';
        legendToggle.textContent = '−';
    } else {
        legendContent.style.display = 'none';
        legendToggle.textContent = '+';
    }
}

function toggleFullscreen() {
    const mapContainer = document.querySelector('.map-container');
    
    if (!document.fullscreenElement) {
        mapContainer.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

// Make functions globally available
window.toggleRoute = toggleRoute;
window.toggleAllRoutes = toggleAllRoutes;
window.zoomToRoutes = zoomToRoutes;
window.toggleLegend = toggleLegend;
window.toggleFullscreen = toggleFullscreen;
window.clearForm = clearForm;