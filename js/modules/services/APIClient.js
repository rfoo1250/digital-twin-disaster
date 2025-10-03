// Name: js/modules/services/ApiClient.js

import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const API_URL = 'http://127.0.0.1:5000';

// HTTP simulation function
async function runSimulation(payload) {
    try {
        const response = await fetch(`${API_URL}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Client Error:', error);
        alert("Error computing counterfactual. See console for details.");
        return null;
    }
}

// wildfire simulation stream
function connectWildfireSimulation(onUpdate, onComplete, onError) {
    const socket = io(API_URL, {
        transports: ["websocket", "polling"], // force both
        timeout: 10000                        // 10s timeout
    });

    socket.on("connect", () => {
        console.log("✅ Connected to wildfire simulation socket", socket.id);
        socket.emit("simulate_wildfire"); // trigger backend simulation
    });

    socket.on("connect_error", (err) => {
        console.error("❌ Socket connection error:", err);
        if (onError) onError(err);
    });

    socket.on("disconnect", (reason) => {
        console.warn("⚠️ Disconnected from wildfire socket:", reason);
    });

    // If backend uses socket.send → event name is "message"
    socket.on("message", (data) => {
        try {
            const parsed = typeof data === "string" ? JSON.parse(data) : data;
            if (parsed.success && parsed.message === "Simulation complete") {
                if (onComplete) onComplete(parsed);
            } else {
                if (onUpdate) onUpdate(parsed);
            }
        } catch (err) {
            console.error("Error parsing wildfire data:", err, data);
            if (onError) onError(err);
        }
    });

    return socket;
}


export { runSimulation, connectWildfireSimulation };
