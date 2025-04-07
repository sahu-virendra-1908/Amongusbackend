const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let clients = new Map();
let nextClientId = 1;

wss.on('connection', (ws) => {
  const clientId = `Client-${nextClientId++}`;
  console.log(`${clientId} connected`);
  
  clients.set(ws, { 
    id: clientId,
    teamName: null,
    location: null // Will store { latitude, longitude }
  });
  console.log(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle team join
      if (data.teamName) {
        clients.set(ws, { 
          ...clients.get(ws), 
          teamName: data.teamName
        });
        console.log(`${clientId} joined team ${data.teamName}`);
      }
      
      // Handle location update
      if (data.latitude && data.longitude) {
        clients.set(ws, { 
          ...clients.get(ws), 
          location: {
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: Date.now()
          }
        });
        broadcastUpdates();
      }
    } catch (err) {
      console.error('Message error:', err);
    }
  });

  ws.on('close', () => {
    console.log(`${clients.get(ws).id} (${clients.get(ws).teamName}) disconnected`);
    clients.delete(ws);
    broadcastUpdates();
  });
});

function calculateDistance(loc1, loc2) {
  // Haversine formula to calculate distance between two coordinates
  const R = 6371e3; // Earth radius in meters
  const φ1 = loc1.latitude * Math.PI/180;
  const φ2 = loc2.latitude * Math.PI/180;
  const Δφ = (loc2.latitude-loc1.latitude) * Math.PI/180;
  const Δλ = (loc2.longitude-loc1.longitude) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

// function broadcastUpdates() {
//   const activeClients = Array.from(clients.entries())
//     .filter(([ws]) => ws.readyState === WebSocket.OPEN)
//     .map(([ws, clientData]) => ({
//       ws,
//       ...clientData
//     }));

//   // Prepare updates for each client
//   const updates = new Map();
  
//   activeClients.forEach(current => {
//     if (!current.location || !current.teamName) return;
    
//     const nearbyTeams = activeClients
//       .filter(other => 
//         other.teamName && 
//         other.location &&
//         other.teamName !== current.teamName &&
//         calculateDistance(current.location, other.location)<=10 // 10 meters
//       )
//       .map(c => ({
//         teamName: c.teamName,
//         distance: calculateDistance(current.location, c.location)
//       }));

//       console.log(`Nearby teams for ${current.id} (${current.teamName}) at`, 
//         `Lat: ${current.location.latitude}, Lon: ${current.location.longitude}:`);
//       nearbyTeams.forEach(team => {
//         console.log(`- ${team.teamName}: ${Math.round(team.distance)} meters away`);
//       });
    
//     updates.set(current.ws, nearbyTeams);
//   });

//   console.log(`Broadcasting to ${activeClients.length} clients`);
//   updates.forEach((nearbyTeams, ws) => {
//     if (ws.readyState === WebSocket.OPEN) {
//       try {
//         ws.send(JSON.stringify({ 
//           type: 'nearbyTeams',
//           nearbyTeams 
//         }));
//       } catch (err) {
//         console.error(`Error sending to ${clients.get(ws).id}:`, err);
//       }
//     }
//   });
// }

// console.log('WebSocket server running on ws://localhost:8080');


function broadcastUpdates() {
  const activeClients = Array.from(clients.entries())
    .filter(([ws]) => ws.readyState === WebSocket.OPEN)
    .map(([ws, clientData]) => ({
      ws,
      ...clientData
    }));

  // Prepare updates for each client
  const updates = new Map();
  
  activeClients.forEach(current => {
    if (!current.location || !current.teamName) return;
    
    // Get unique teams nearby (excluding own team)
    const nearbyTeams = new Map(); // Use Map to ensure uniqueness by team name
    
    activeClients.forEach(other => {
      // Skip if any condition is not met
      if (!other.teamName || 
          !other.location || 
          other.teamName === current.teamName) return;
      
      const distance = calculateDistance(current.location, other.location);
      if (distance <= 10) { // 10 meters
        // Only add team if it's not already added or if we found a closer member
        if (!nearbyTeams.has(other.teamName) || 
            distance < nearbyTeams.get(other.teamName).distance) {
          nearbyTeams.set(other.teamName, {
            teamName: other.teamName,
            distance: distance
          });
        }
      }
    });
    
    // Convert Map values to array
    const nearbyTeamsArray = Array.from(nearbyTeams.values());
    
    console.log(`Nearby teams for ${current.id} (${current.teamName}) at`,
      `Lat: ${current.location.latitude}, Lon: ${current.location.longitude}:`);
    nearbyTeamsArray.forEach(team => {
      console.log(`- ${team.teamName}: ${Math.round(team.distance)} meters away`);
    });
    
    updates.set(current.ws, nearbyTeamsArray);
  });

  console.log(`Broadcasting to ${activeClients.length} clients`);
  updates.forEach((nearbyTeams, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'nearbyTeams',
          nearbyTeams
        }));
      } catch (err) {
        console.error(`Error sending to ${clients.get(ws).id}:`, err);
      }
    }
  });
}

console.log('WebSocket server running on ws://localhost:8080');
