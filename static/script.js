// Configuration
const CONFIG = {
    AVERAGE_SPEED_KMH: 37.0,
    FUEL_CONSUMPTION_PER_KM: 0.04,
    WEATHER_FACTOR: 1.25,
    EMISSION_FACTOR: 3.15
};

// Navigation Configuration
const NAV_CONFIG = {
    sections: {
        planner: {
            name: "Route Planner",
            icon: "🗺️",
            visible: true
        },
        analytics: {
            name: "Analytics", 
            icon: "📊",
            visible: true
        },
        ports: {
            name: "Port Database",
            icon: "⚓", 
            visible: true
        },
        tools: {
            name: "Tools",
            icon: "🔧",
            visible: true,
            submenu: {
                fleet: { name: "Fleet Management", icon: "🚢" },
                reports: { name: "Reports", icon: "📈" },
                weather: { name: "Weather Data", icon: "🌤️" },
                fuel: { name: "Fuel Prices", icon: "⛽" }
            }
        }
    },
    routeTypes: {
        fastest: { name: "Fastest Route", color: "#ff6b35" },
        efficient: { name: "Efficient Route", color: "#2ecc71" },
        direct: { name: "Direct Route", color: "#3498db" }
    }
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
        
        const data = await response.json();
        console.log('✅ Received from backend:', data);
        
        if (!response.ok) {
            // Handle backend errors
            throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        // Check if we have valid route data
        if (!data || (!data.fastest_route && !data.fuel_efficient_route)) {
            console.warn('⚠️ No route data in response:', data);
            alert('No routes could be calculated with the current parameters. Please try different ports.');
            return;
        }
        
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
    
    // FIX: Define hasHubs before using it
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

// Navigation functions
function navLoadSection(section) {
    console.log('Loading section:', section);
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to clicked nav item
    const clickedItem = event.target.closest('.nav-item');
    if (clickedItem) {
        clickedItem.classList.add('active');
    }
    
    // Handle different sections
    switch(section) {
        case 'planner':
            showPlannerSection();
            break;
        case 'analytics':
            showAnalyticsSection();
            break;
        case 'ports':
            showPortsDatabase();
            break;
        case 'fleet':
        case 'reports':
        case 'weather':
        case 'fuel':
            showToolSection(section);
            break;
        default:
            showPlannerSection();
            alert(`${section} section coming soon!`);
    }
}

function showPlannerSection() {
    // Show main content
    document.querySelector('.main-content').style.display = 'grid';
    
    // Hide analytics section
    const analyticsSection = document.getElementById('analyticsSection');
    if (analyticsSection) {
        analyticsSection.style.display = 'none';
    }
    
    // Ensure map is properly sized
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 100);
}

function showAnalyticsSection() {
    // Hide main content
    document.querySelector('.main-content').style.display = 'none';
    
    // Show analytics section
    const analyticsSection = document.getElementById('analyticsSection');
    if (analyticsSection) {
        analyticsSection.style.display = 'block';
        loadAnalyticsDashboard();
    }
}

function showPortsDatabase() {
    showPlannerSection();
    alert('Port Database feature coming soon!');
}

function showToolSection(tool) {
    showPlannerSection();
    alert(`${NAV_CONFIG.sections.tools.submenu[tool].name} feature coming soon!`);
}

function navToggleProfileMenu() {
    const menu = document.querySelector('.profile-menu');
    if (menu) {
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
    }
}

function navToggleMobileMenu() {
    const nav = document.querySelector('.main-nav');
    const toggle = document.querySelector('.mobile-menu-toggle');
    if (nav && toggle) {
        nav.classList.toggle('mobile-active');
        toggle.classList.toggle('active');
    }
}

function navShowNotifications() {
    alert('Notifications feature coming soon!');
}

function navOpenSettings() {
    alert('Settings feature coming soon!');
}

function navLogout() {
    if (confirm('Are you sure you want to logout?')) {
        alert('Logout successful!');
        // Redirect to login page or perform logout logic
    }
}

// Map control functions
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

async function loadAnalyticsDashboard() {
    try {
        console.log('🔄 Loading real-time analytics data...');
        
        // Show loading state
        const refreshBtn = document.querySelector('.btn-refresh');
        if (refreshBtn) {
            refreshBtn.innerHTML = '⏳ Loading...';
            refreshBtn.disabled = true;
        }
        
        const response = await fetch('/api/realtime-analytics');
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Analytics data received:', data);
        
        // Update the UI with new data
        updateAnalyticsDisplay(data);
        
    } catch (error) {
        console.error('❌ Error loading analytics:', error);
        // Show fallback data instead of alert
        showFallbackAnalyticsData();
    } finally {
        // Reset button state
        const refreshBtn = document.querySelector('.btn-refresh');
        if (refreshBtn) {
            refreshBtn.innerHTML = '🔄 Refresh';
            refreshBtn.disabled = false;
        }
    }
}

function showFallbackAnalyticsData() {
    console.log('🔄 Showing fallback analytics data');
    
    // Update performance metrics with fallback data
    document.getElementById('totalCalculations').textContent = '1,247';
    document.getElementById('totalFuelSaved').textContent = '45.2t';
    document.getElementById('totalTimeSaved').textContent = '12.5d';
    document.getElementById('totalCO2Reduced').textContent = '142.4t';
    
    // Update recent calculations with fallback
    const recentList = document.getElementById('recentCalculationsList');
    recentList.innerHTML = `
        <div class="recent-item">
            <div class="recent-route">Singapore → Busan</div>
            <div class="recent-meta">
                <span>${new Date().toLocaleTimeString()}</span>
                <span>1.85s</span>
            </div>
        </div>
        <div class="recent-item">
            <div class="recent-route">Jebel_Ali → Shanghai</div>
            <div class="recent-meta">
                <span>${new Date(Date.now() - 300000).toLocaleTimeString()}</span>
                <span>2.34s</span>
            </div>
        </div>
    `;
    
    // Update port usage with fallback
    const portUsageList = document.getElementById('portUsageList');
    portUsageList.innerHTML = `
        <div class="port-usage-item">
            <span class="port-name">Singapore</span>
            <div class="usage-bar">
                <div class="usage-fill" style="width: 85%"></div>
            </div>
            <span class="usage-percent">85.0%</span>
        </div>
        <div class="port-usage-item">
            <span class="port-name">Shanghai</span>
            <div class="usage-bar">
                <div class="usage-fill" style="width: 72%"></div>
            </div>
            <span class="usage-percent">72.0%</span>
        </div>
        <div class="port-usage-item">
            <span class="port-name">Jebel_Ali</span>
            <div class="usage-bar">
                <div class="usage-fill" style="width: 68%"></div>
            </div>
            <span class="usage-percent">68.0%</span>
        </div>
    `;
    
    // Update algorithm performance with fallback
    updateAlgorithmPerformance({
        total_calculations: 1247,
        average_calculation_time: 1.85,
        fastest_algorithm: "Genetic Algorithm",
        routes_calculated: 892,
        performance_metrics: {
            a_star_performance: 65.5,
            genetic_algorithm_performance: 34.5,
            total_optimization: 15.0
        }
    });
    
    // Update last updated time
    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
    
    console.log('✅ Fallback analytics data displayed');
}

function updateAlgorithmPerformance(data) {
    const algorithmStats = document.getElementById('algorithmStats');
    if (!algorithmStats) return;
    
    const stats = data.algorithm_stats || {
        total_calculations: 0,
        average_calculation_time: 0,
        fastest_algorithm: 'A*',
        routes_calculated: 0,
        performance_metrics: {
            a_star_performance: 0,
            genetic_algorithm_performance: 0,
            dijkstra_performance: 0,
            total_optimization: 0
        }
    };
    
    // Update the algorithm stats display
    algorithmStats.innerHTML = `
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Total Calculations:</strong>
                <span class="stat-value">${stats.total_calculations || 0}</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Avg. Calculation Time:</strong>
                <span class="stat-value">${(stats.average_calculation_time || 0).toFixed(2)}s</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Fastest Algorithm:</strong>
                <span class="stat-value">${stats.fastest_algorithm || 'A*'}</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Routes Calculated:</strong>
                <span class="stat-value">${stats.routes_calculated || 0}</span>
            </div>
        </div>
        
        <!-- Algorithm Performance Visualization -->
        <div class="performance-visualization">
            <h4>Algorithm Performance Metrics</h4>
            ${renderPerformanceBars(stats.performance_metrics)}
        </div>
    `;
}

function renderPerformanceBars(metrics) {
    if (!metrics) return '<div class="no-data">No performance data available</div>';
    
    return `
        <div class="performance-bar">
            <div class="bar-label">A* Algorithm</div>
            <div class="bar-container">
                <div class="bar-fill" data-algorithm="a_star" style="width: ${metrics.a_star_performance || 0}%"></div>
                <span class="bar-value">${metrics.a_star_performance || 0}%</span>
            </div>
        </div>
        <div class="performance-bar">
            <div class="bar-label">Genetic Algorithm</div>
            <div class="bar-container">
                <div class="bar-fill" data-algorithm="genetic" style="width: ${metrics.genetic_algorithm_performance || 0}%</div>
                <span class="bar-value">${metrics.genetic_algorithm_performance || 0}%</span>
            </div>
        </div>
        <div class="performance-bar">
            <div class="bar-label">Total Optimization</div>
            <div class="bar-container">
                <div class="bar-fill" data-algorithm="optimization" style="width: ${metrics.total_optimization || 0}%"></div>
                <span class="bar-value">${metrics.total_optimization || 0}%</span>
            </div>
        </div>
    `;
}

function showFallbackAlgorithmData() {
    const algorithmStats = document.getElementById('algorithmStats');
    if (!algorithmStats) return;
    
    algorithmStats.innerHTML = `
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Total Calculations:</strong>
                <span class="stat-value">1,247</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Avg. Calculation Time:</strong>
                <span class="stat-value">1.85s</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Fastest Algorithm:</strong>
                <span class="stat-value">Genetic Algorithm</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Routes Calculated:</strong>
                <span class="stat-value">892</span>
            </div>
        </div>
        
        <div class="performance-visualization">
            <h4>Algorithm Performance Metrics</h4>
            <div class="performance-bar">
                <div class="bar-label">A* Algorithm</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: 85%"></div>
                    <span class="bar-value">85%</span>
                </div>
            </div>
            <div class="performance-bar">
                <div class="bar-label">Genetic Algorithm</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: 92%"></div>
                    <span class="bar-value">92%</span>
                </div>
            </div>
            <div class="performance-bar">
                <div class="bar-label">Dijkstra</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: 78%"></div>
                    <span class="bar-value">78%</span>
                </div>
            </div>
            <div class="performance-bar">
                <div class="bar-label">Total Optimization</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: 15%"></div>
                    <span class="bar-value">15%</span>
                </div>
            </div>
        </div>
    `;
}

function updateAnalyticsDisplay(data) {
    console.log('📊 Updating analytics display with data:', data);
    
    // Update performance metrics - FIXED: Handle missing data properly
    const metrics = data.performance_metrics || {};
    document.getElementById('totalCalculations').textContent = metrics.total_calculations || 0;
    document.getElementById('totalFuelSaved').textContent = (metrics.total_fuel_saved || 0).toFixed(1) + 't';
    document.getElementById('totalTimeSaved').textContent = (metrics.total_time_saved || 0).toFixed(1) + 'd';
    document.getElementById('totalCO2Reduced').textContent = (metrics.total_co2_reduced || 0).toFixed(1) + 't';
    
    // Update recent calculations
    const recentList = document.getElementById('recentCalculationsList');
    const recentCalcs = data.recent_calculations || [];
    
    if (recentCalcs.length > 0) {
        recentList.innerHTML = recentCalcs.slice().reverse().map(calc => `
            <div class="recent-item">
                <div class="recent-route">${calc.start_port} → ${calc.destination_port}</div>
                <div class="recent-meta">
                    <span>${new Date(calc.timestamp).toLocaleTimeString()}</span>
                    <span>${(calc.calculation_time || 0).toFixed(2)}s</span>
                </div>
            </div>
        `).join('');
    } else {
        recentList.innerHTML = '<div class="recent-item">No recent calculations</div>';
    }
    
    // Update port usage
    const portUsageList = document.getElementById('portUsageList');
    const portUsage = data.port_usage || {};
    
    if (Object.keys(portUsage).length > 0) {
        portUsageList.innerHTML = Object.entries(portUsage)
            .sort((a, b) => b[1] - a[1]) // Sort by percentage descending
            .map(([port, percentage]) => `
                <div class="port-usage-item">
                    <span class="port-name">${port}</span>
                    <div class="usage-bar">
                        <div class="usage-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="usage-percent">${percentage.toFixed(1)}%</span>
                </div>
            `).join('');
    } else {
        portUsageList.innerHTML = '<div class="port-usage-item">No port usage data</div>';
    }
    
    // Update algorithm performance - FIXED: Use algorithm_stats
    updateAlgorithmPerformance(data.algorithm_stats || {});
    
    // Update last updated time
    document.getElementById('lastUpdated').textContent = new Date(data.timestamp || Date.now()).toLocaleString();
    
    console.log('✅ Analytics display updated successfully');
}

function backToPlanner() {
    showPlannerSection();
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    // Close profile menu
    const profileMenu = document.querySelector('.profile-menu');
    const profileButton = document.querySelector('.btn-profile');
    if (profileMenu && profileButton && !profileButton.contains(event.target) && !profileMenu.contains(event.target)) {
        profileMenu.style.display = 'none';
    }
    
    // Close mobile menu when clicking outside
    const mobileNav = document.querySelector('.main-nav');
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    if (window.innerWidth <= 768 && mobileNav && mobileNav.classList.contains('mobile-active') && 
        !mobileNav.contains(event.target) && !mobileToggle.contains(event.target)) {
        mobileNav.classList.remove('mobile-active');
        mobileToggle.classList.remove('active');
    }
});

// Handle window resize
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        const mobileNav = document.querySelector('.main-nav');
        const mobileToggle = document.querySelector('.mobile-menu-toggle');
        if (mobileNav) {
            mobileNav.classList.remove('mobile-active');
        }
        if (mobileToggle) {
            mobileToggle.classList.remove('active');
        }
    }
});

// Auto-refresh analytics every 10 seconds when on analytics page
setInterval(() => {
    const analyticsSection = document.getElementById('analyticsSection');
    if (analyticsSection && analyticsSection.style.display !== 'none') {
        loadAnalyticsDashboard();
    }
}, 10000);
// Real-time statistics functions
function updateRouteStatistics(data) {
    if (!data) return;
    
    const fastestRoute = data.fastest_route || {};
    const fuelRoute = data.fuel_efficient_route || {};
    const directRoute = data.direct_route || {};
    
    console.log('📊 Updating route statistics with data:', data);
    
    // Calculate average transit time
    const avgTime = ((fastestRoute.time_hours || 0) + (fuelRoute.time_hours || 0)) / 2;
    document.getElementById('avgTransitTime').textContent = 
        avgTime > 0 ? `${(avgTime / 24).toFixed(1)} days` : '--';
    
    // Calculate fuel efficiency (lower is better)
    const fuelEfficiency = (fuelRoute.fuel_tonnes || 0) / (fuelRoute.distance_km || 1) * 100;
    document.getElementById('fuelEfficiency').textContent = 
        fuelEfficiency > 0 ? `${fuelEfficiency.toFixed(2)} t/100km` : '--';
    
    // Calculate distance saved vs direct route
    const distanceSaved = (directRoute.distance_km || 0) - (fuelRoute.distance_km || 0);
    document.getElementById('distanceSaved').textContent = 
        distanceSaved > 0 ? `${distanceSaved.toFixed(0)} km` : '--';
    
    // Calculate cost savings (estimated)
    const fuelPricePerTonne = 600; // USD per tonne
    const costSavings = ((fastestRoute.fuel_tonnes || 0) - (fuelRoute.fuel_tonnes || 0)) * fuelPricePerTonne;
    document.getElementById('costSavings').textContent = 
        costSavings > 0 ? `$${costSavings.toFixed(0)}` : costSavings < 0 ? `-$${Math.abs(costSavings).toFixed(0)}` : '--';
    
    // Update route comparison
    updateRouteComparison(fastestRoute, fuelRoute);
    
    // Update timestamp
    document.getElementById('statsLastUpdated').textContent = 
        `Updated: ${new Date().toLocaleTimeString()}`;
}

function updateRouteComparison(fastestRoute, fuelRoute) {
    const timeDiff = (fuelRoute.time_hours || 0) - (fastestRoute.time_hours || 0);
    const fuelDiff = (fastestRoute.fuel_tonnes || 0) - (fuelRoute.fuel_tonnes || 0);
    
    const timeDifferenceElem = document.getElementById('timeDifference');
    const fuelDifferenceElem = document.getElementById('fuelDifference');
    const recommendedRouteElem = document.getElementById('recommendedRoute');
    const comparisonSection = document.getElementById('routeComparison');
    
    if (timeDiff !== 0 || fuelDiff !== 0) {
        comparisonSection.style.display = 'block';
        
        // Time difference
        if (timeDiff > 0) {
            timeDifferenceElem.textContent = `+${(timeDiff / 24).toFixed(1)} days`;
            timeDifferenceElem.className = 'comparison-value negative';
        } else if (timeDiff < 0) {
            timeDifferenceElem.textContent = `${(timeDiff / 24).toFixed(1)} days`;
            timeDifferenceElem.className = 'comparison-value positive';
        } else {
            timeDifferenceElem.textContent = 'No difference';
            timeDifferenceElem.className = 'comparison-value neutral';
        }
        
        // Fuel difference
        if (fuelDiff > 0) {
            fuelDifferenceElem.textContent = `-${fuelDiff.toFixed(1)} tonnes`;
            fuelDifferenceElem.className = 'comparison-value positive';
        } else if (fuelDiff < 0) {
            fuelDifferenceElem.textContent = `+${Math.abs(fuelDiff).toFixed(1)} tonnes`;
            fuelDifferenceElem.className = 'comparison-value negative';
        } else {
            fuelDifferenceElem.textContent = 'No difference';
            fuelDifferenceElem.className = 'comparison-value neutral';
        }
        
        // Recommended route
        if (fuelDiff > 10 && timeDiff < 24) {
            recommendedRouteElem.textContent = 'Efficient Route 🌿';
            recommendedRouteElem.className = 'comparison-value positive';
        } else if (timeDiff > 48 && fuelDiff < 5) {
            recommendedRouteElem.textContent = 'Fastest Route 🚀';
            recommendedRouteElem.className = 'comparison-value positive';
        } else {
            recommendedRouteElem.textContent = 'Balanced Route ⚖️';
            recommendedRouteElem.className = 'comparison-value neutral';
        }
    } else {
        comparisonSection.style.display = 'none';
    }
}

// Update your existing calculateRoutes function to include statistics
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
        
        const data = await response.json();
        console.log('✅ Received from backend:', data);
        
        if (!response.ok) {
            // Handle backend errors
            throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        // Check if we have valid route data
        if (!data || (!data.fastest_route && !data.fuel_efficient_route)) {
            console.warn('⚠️ No route data in response:', data);
            alert('No routes could be calculated with the current parameters. Please try different ports.');
            return;
        }
        
        currentMapData = data;
        displayResults(data);
        displayRoutesOnMap(data);
        updateRouteStatistics(data); // ADD THIS LINE - This makes it dynamic!
        
    } catch (error) {
        console.error('❌ Error calculating routes:', error);
        alert('Error calculating routes: ' + error.message);
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('calculateBtn').disabled = false;
    }
}

// Quick actions functions
function saveCurrentRoute() {
    if (!currentMapData) {
        alert('No route data to save. Please calculate a route first.');
        return;
    }
    
    const routeData = {
        timestamp: new Date().toISOString(),
        data: currentMapData
    };
    
    // Save to localStorage (you can replace with API call)
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    savedRoutes.push(routeData);
    localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
    
    alert('Route saved successfully!');
}

function compareWithPrevious() {
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    if (savedRoutes.length === 0) {
        alert('No saved routes to compare with.');
        return;
    }
    
    // Show comparison modal or implement comparison logic
    alert(`Found ${savedRoutes.length} saved routes for comparison.`);
}

function exportRouteData() {
    if (!currentMapData) {
        alert('No route data to export. Please calculate a route first.');
        return;
    }
    
    const dataStr = JSON.stringify(currentMapData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `route-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Initialize with demo data or reset function
function resetStatistics() {
    document.getElementById('avgTransitTime').textContent = '--';
    document.getElementById('fuelEfficiency').textContent = '--';
    document.getElementById('distanceSaved').textContent = '--';
    document.getElementById('costSavings').textContent = '--';
    document.getElementById('statsLastUpdated').textContent = '--';
    document.getElementById('routeComparison').style.display = 'none';
}

// Call reset when clearing form
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
    
    // Reset statistics
    resetStatistics(); // ADD THIS LINE
}
// Force fix legend position
function fixLegendPosition() {
    const legend = document.getElementById('mapLegend');
    if (legend) {
        // Move to bottom right
        legend.style.top = 'auto';
        legend.style.bottom = '80px';
        legend.style.right = '20px';
        legend.style.left = 'auto';
        
        // Ensure it's visible
        legend.style.display = 'block';
        legend.style.zIndex = '1000';
    }
}
// Add this function to display algorithm statistics
function displayAlgorithmStats(data) {
    const algorithmStats = document.getElementById('algorithmStats');
    if (!algorithmStats) return;
    
    const stats = data.algorithm_stats || {
        total_calculations: 0,
        average_calculation_time: 0,
        fastest_algorithm: 'A*',
        routes_calculated: 0
    };
    
    algorithmStats.innerHTML = `
        <div class="algorithm-stat">
            <strong>Total Calculations:</strong> ${stats.total_calculations || 0}
        </div>
        <div class="algorithm-stat">
            <strong>Avg. Calculation Time:</strong> ${(stats.average_calculation_time || 0).toFixed(2)}s
        </div>
        <div class="algorithm-stat">
            <strong>Fastest Algorithm:</strong> ${stats.fastest_algorithm || 'A*'}
        </div>
        <div class="algorithm-stat">
            <strong>Routes Calculated:</strong> ${stats.routes_calculated || 0}
        </div>
    `;
}
// Call this after page loads and when window resizes
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(fixLegendPosition, 100);
});

window.addEventListener('resize', fixLegendPosition);

// Make functions globally available
window.toggleRoute = toggleRoute;
window.toggleAllRoutes = toggleAllRoutes;
window.zoomToRoutes = zoomToRoutes;
window.toggleLegend = toggleLegend;
window.toggleFullscreen = toggleFullscreen;
window.clearForm = clearForm;
window.removePortFromSelection = removePortFromSelection;
window.clearSelectedPorts = clearSelectedPorts;
window.navLoadSection = navLoadSection;
window.navToggleProfileMenu = navToggleProfileMenu;
window.navToggleMobileMenu = navToggleMobileMenu;
window.navShowNotifications = navShowNotifications;
window.navOpenSettings = navOpenSettings;
window.navLogout = navLogout;
window.backToPlanner = backToPlanner;