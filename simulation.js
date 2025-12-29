/**
 * Social Simulation Engine
 * Handles agent behavior, physics, and interactions.
 */

class Agent {
    constructor(id, personality, x, y, canvasWidth, canvasHeight, model) {
        this.id = id;
        this.personality = { ...personality };
        this.baseColor = personality.color;
        this.color = personality.color;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = 4;

        // World bounds
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.model = model; // Reference to main model for interactions

        // Stats
        this.entropy = 0;
        this.ticks = 0; // Track simulation age
        this.resource = 0.5;
        this.isDeactivated = false;

        // AI Properties
        this.visionRadius = 60;
        this.cooldown = 0;
        this.state = 'IDLE';
    }

    update(agents, dt, grid) {
        if (this.isDeactivated) return;

        // Apply constant decay
        this.energy -= 0.0002 * dt;
        if (this.energy <= 0) {
            this.convertToInert();
        }

        // Logic: Vision and Steering
        this.think(grid, dt);

        // Movement
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Boundary bounce (Torus)
        if (this.x < 0) this.x = this.canvasWidth;
        if (this.x > this.canvasWidth) this.x = 0;
        if (this.y < 0) this.y = this.canvasHeight;
        if (this.y > this.canvasHeight) this.y = 0;

        if (this.cooldown > 0) this.cooldown -= dt;
    }

    think(grid, dt) {
        const neighbors = this.getNeighbors(grid);
        if (neighbors.length === 0) {
            this.state = 'IDLE';
            return;
        }

        let target = null;
        let threat = null;

        for (let other of neighbors) {
            if (other === this || other.isDeactivated) continue;
            const dist = this.dist(other);
            if (dist > this.visionRadius) continue;

            if (this.personality.faction === 'Entropics') {
                if (other.personality.faction === 'Luminaries' || other.personality.faction === 'Inert') {
                    if (!target || dist < this.dist(target)) target = other;
                }
            } else if (this.personality.faction === 'Luminaries') {
                if (other.personality.faction === 'Entropics') {
                    if (!threat || dist < this.dist(threat)) threat = other;
                } else if (other.personality.faction === 'Inert' || other.personality.faction === 'Luminaries') {
                    if (!target || dist < this.dist(target)) target = other;
                }
            } else if (this.personality.faction === 'Inert') {
                if (other.personality.faction === 'Entropics') {
                    if (!threat || dist < this.dist(threat)) threat = other;
                }
            } else if (this.personality.faction === 'Catalysts') {
                // Catalysts target Entropics to disrupt them
                if (other.personality.faction === 'Entropics') {
                    if (!target || dist < this.dist(target)) target = other;
                }
                // Catalysts flee from other Catalysts or Luminaries if they are too strong
                if (other.personality.faction === 'Catalysts' || other.personality.faction === 'Luminaries') {
                    const otherAggression = other.personality.aggression * (this.model.weights.aggression || 1);
                    const myAggression = this.personality.aggression * (this.model.weights.aggression || 1);

                    if (otherAggression > myAggression && (!threat || dist < this.dist(threat))) {
                        threat = other;
                    }
                }
            }
        }

        if (threat) {
            this.state = 'FLEE';
            this.steerAway(threat, dt);
        } else if (target) {
            this.state = 'HUNT';
            this.steerToward(target, dt);
        } else {
            this.state = 'IDLE';
            // Add some random movement for idle agents, especially Catalysts
            if (Math.random() < 0.05) { // 5% chance to change direction
                this.vx += (Math.random() - 0.5) * 0.5;
                this.vy += (Math.random() - 0.5) * 0.5;
            }
            // Dampen velocity
            this.vx *= 0.98;
            this.vy *= 0.98;
        }

        this.processProximity(neighbors);
    }

    getNeighbors(grid) {
        if (!grid) return [];
        const gx = Math.floor(this.x / grid.cellSize);
        const gy = Math.floor(this.y / grid.cellSize);
        let results = [];
        for (let x = gx - 1; x <= gx + 1; x++) {
            for (let y = gy - 1; y <= gy + 1; y++) {
                const key = `${x},${y}`;
                if (grid.data[key]) results = results.concat(grid.data[key]);
            }
        }
        return results;
    }

    steerToward(target, dt) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const speed = (this.personality.energy || 0.5) * 2 * (this.model.weights.energy || 1);
        const desireX = (dx / dist) * speed;
        const desireY = (dy / dist) * speed;
        this.vx += (desireX - this.vx) * 0.1 * dt;
        this.vy += (desireY - this.vy) * 0.1 * dt;
    }

    steerAway(threat, dt) {
        const dx = threat.x - this.x;
        const dy = threat.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const speed = (this.personality.energy || 0.5) * 2 * (this.model.weights.energy || 1);
        const desireX = (-dx / dist) * speed * 1.5;
        const desireY = (-dy / dist) * speed * 1.5;
        this.vx += (desireX - this.vx) * 0.1 * dt;
        this.vy += (desireY - this.vy) * 0.1 * dt;
    }

    processProximity(neighbors) {
        if (this.cooldown > 0) return;
        for (let other of neighbors) {
            if (other === this || other.isDeactivated) continue;
            const dist = this.dist(other);
            const interactDist = this.radius + other.radius + 2;
            if (dist < interactDist) {
                this.handleCollision(other);
                break;
            }
        }
    }

    dist(other) {
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    handleCollision(other) {
        this.cooldown = 10;
        const faction = this.personality.faction;
        const otherFaction = other.personality.faction;

        if (faction === "Entropics") {
            const myAggression = this.personality.aggression * (this.model.weights.aggression || 1);
            const otherEmpathy = other.personality.empathy * (this.model.weights.empathy || 1);

            if (myAggression > otherEmpathy) {
                const drain = 0.1;
                other.resource -= drain;
                this.resource += drain;
                this.energy = Math.min(1.0, this.energy + 0.1);
                if (other.resource <= 0) {
                    if (this.personality.name === "Reaper") {
                        other.isDeactivated = true;
                    } else {
                        other.convertToEntropic(this.personality);
                    }
                }
            }
        } else if (faction === "Luminaries") {
            if (otherFaction === "Entropics") {
                const myEmpathy = this.personality.empathy * (this.model.weights.empathy || 1);
                const otherAggression = other.personality.aggression * (this.model.weights.aggression || 1);

                if (myEmpathy > otherAggression) {
                    other.resource -= 0.05;
                    this.resource += 0.02;
                }
            } else if (otherFaction === "Inert" || (otherFaction === "Luminaries" && other.resource < 1)) {
                const share = 0.05;
                if (this.resource > 0.2) {
                    this.resource -= share;
                    other.resource += share;
                    if (otherFaction === "Inert" && other.resource > 0.5) {
                        other.convertToLuminary(this.personality);
                    }
                }
            }
        } else if (faction === "Catalysts") {
            if (otherFaction === "Entropics") {
                // Catalysts disrupt Entropics, reducing their resource and potentially converting them
                const disrupt = 0.15;
                other.resource -= disrupt;
                this.resource += disrupt * 0.5; // Catalysts gain some resource from disruption
                this.energy = Math.min(1.0, this.energy + 0.05);
                if (other.resource <= 0.1 && Math.random() < 0.3) { // Chance to convert weak Entropics to Inert
                    other.convertToInert();
                }
            } else if (otherFaction === "Luminaries") {
                // Catalysts might randomly interact with Luminaries, sometimes boosting, sometimes draining
                if (Math.random() < 0.5) {
                    const share = 0.03;
                    if (this.resource > 0.1) {
                        this.resource -= share;
                        other.resource += share;
                    }
                } else {
                    const drain = 0.03;
                    other.resource -= drain;
                    this.resource += drain;
                }
            } else if (otherFaction === "Inert") {
                // Catalysts can awaken Inert agents, converting them to Catalysts or Luminaries
                if (Math.random() < 0.1 && other.resource > 0.3) {
                    if (Math.random() < 0.5) {
                        other.convertToCatalyst(this.personality);
                    } else {
                        other.convertToLuminary(this.personality);
                    }
                }
            }
        }
        this.radius = Math.max(2, 3 + (this.resource * 4));
    }

    convertToEntropic(sourcePersonality) {
        this.personality.faction = "Entropics";
        this.color = sourcePersonality.color;
        this.personality.aggression = Math.max(0.8, this.personality.aggression + 0.2); // Aggressive
        this.personality.empathy = 0.0; // Cold (No Halo)
        this.personality.energy = 0.8; // High energy
    }

    convertToLuminary(sourcePersonality) {
        this.personality.faction = "Luminaries";
        this.color = sourcePersonality.color;
        this.personality.empathy = Math.max(0.8, this.personality.empathy + 0.1); // High Empathy (Halo)
        this.personality.aggression = 0.1; // Gentle
    }

    convertToInert() {
        this.personality.faction = "Inert";
        this.color = "#808080";
        this.personality.aggression = 0.1;
        this.personality.energy = 0.2;
    }

    convertToCatalyst(sourcePersonality) {
        this.personality.faction = "Catalysts";
        this.color = sourcePersonality.color;
        this.personality.aggression = 0.5;
        this.personality.empathy = 0.5;
    }

    draw(ctx) {
        if (this.isDeactivated) return;
        // Use global energy to pulse size slightly
        const pulse = (this.model.weights.energy > 1.5) ? Math.sin(Date.now() / 200) * 2 : 0;

        ctx.beginPath();
        const safeRadius = Math.max(2, this.radius);
        ctx.arc(this.x, this.y, safeRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        if (this.personality.empathy > 0.8) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
        } else {
            ctx.shadowBlur = 0;
        }
    }
}

class Simulation {
    constructor() {
        this.canvas = document.getElementById('simCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.agents = [];
        this.personalities = [];
        this.isRunning = false;
        this.speed = 1.0;
        this.lastTime = 0;
        this.isHybridMode = true;
        this.backendUrl = window.location.origin; // Same-origin
        this.isSyncing = false;

        this.resize();
        this.setupListeners();
        this.init();
        // this.animate() called at end of init

        window.addEventListener('resize', () => this.resize());

        // Global World Weights
        this.weights = { aggression: 1.0, empathy: 1.0, energy: 1.0 };
    }

    async loadData() {
        try {
            // Fetch configuration from file to ensure frontend/backend sync
            // Add timestamp to prevent caching
            const response = await fetch(`personalities.json?v=${new Date().getTime()}`);
            if (!response.ok) throw new Error("Failed to load personalities.json");

            const data = await response.json();
            this.personalities = data.personalities.flatMap(p => p.types.map(t => ({ ...t, faction: p.faction })));
            console.log("Loaded personalities configuration from file.");
            this.log("Configuration loaded from file.");
        } catch (e) {
            console.warn("Failed to load personalities from file, using fallback:", e);
            this.log("⚠️ Config load failed. Using embedded fallback data.");

            // Fallback Data (Source of truth if file load fails)
            const data = {
                "personalities": [
                    {
                        "faction": "Entropics",
                        "types": [
                            { "id": 1, "name": "The Void", "color": "#2A0000", "aggression": 1.0, "empathy": 0.0, "energy": 0.2 },
                            { "id": 2, "name": "Berserker", "color": "#FF0000", "aggression": 0.9, "empathy": 0.1, "energy": 0.9 },
                            { "id": 3, "name": "Leech", "color": "#8B0000", "aggression": 0.4, "empathy": 0.2, "energy": 0.4 },
                            { "id": 4, "name": "Shadow", "color": "#4A0404", "aggression": 0.2, "empathy": 0.1, "energy": 0.7 },
                            { "id": 5, "name": "Corruptor", "color": "#800000", "aggression": 0.8, "empathy": 0.0, "energy": 0.5 },
                            { "id": 6, "name": "Viral", "color": "#B22222", "aggression": 0.7, "empathy": 0.1, "energy": 0.8 },
                            { "id": 7, "name": "Nihilist", "color": "#3D0000", "aggression": 0.3, "empathy": 0.0, "energy": 0.1 },
                            { "id": 8, "name": "Specter", "color": "#5C0E0E", "aggression": 0.5, "empathy": 0.1, "energy": 0.6 },
                            { "id": 9, "name": "Obsidian", "color": "#1F0505", "aggression": 0.1, "empathy": 0.0, "energy": 0.0 },
                            { "id": 10, "name": "Reaper", "color": "#660000", "aggression": 0.9, "empathy": 0.0, "energy": 1.0 }
                        ]
                    },
                    {
                        "faction": "Luminaries",
                        "types": [
                            { "id": 11, "name": "The Sun", "color": "#FFD700", "aggression": 0.1, "empathy": 1.0, "energy": 0.1 },
                            { "id": 12, "name": "Monk", "color": "#FFFACD", "aggression": 0.0, "empathy": 0.9, "energy": 0.2 },
                            { "id": 13, "name": "Beacon", "color": "#FFFFFF", "aggression": 0.5, "empathy": 0.8, "energy": 0.5 },
                            { "id": 14, "name": "Protector", "color": "#F0E68C", "aggression": 0.6, "empathy": 0.7, "energy": 0.6 },
                            { "id": 15, "name": "Messenger", "color": "#EEDD82", "aggression": 0.2, "empathy": 0.9, "energy": 0.9 },
                            { "id": 16, "name": "Aura", "color": "#FAFAD2", "aggression": 0.1, "empathy": 0.8, "energy": 0.4 },
                            { "id": 17, "name": "Prism", "color": "#FFFFE0", "aggression": 0.3, "empathy": 0.7, "energy": 0.7 },
                            { "id": 18, "name": "Guardian", "color": "#B8860B", "aggression": 0.8, "empathy": 0.6, "energy": 0.5 },
                            { "id": 19, "name": "Starlight", "color": "#F5F5DC", "aggression": 0.1, "empathy": 0.5, "energy": 1.0 },
                            { "id": 20, "name": "Sage", "color": "#DAA520", "aggression": 0.0, "empathy": 1.0, "energy": 0.3 }
                        ]
                    },
                    {
                        "faction": "Catalysts",
                        "types": [
                            { "id": 21, "name": "Chaos", "color": "#FF00FF", "aggression": 0.5, "empathy": 0.5, "energy": 1.0 },
                            { "id": 22, "name": "Glitch", "color": "#00FFFF", "aggression": 0.2, "empathy": 0.2, "energy": 0.8 },
                            { "id": 23, "name": "Mutant", "color": "#39FF14", "aggression": 0.7, "empathy": 0.3, "energy": 0.6 },
                            { "id": 24, "name": "Spark", "color": "#FF4500", "aggression": 0.9, "empathy": 0.5, "energy": 0.9 },
                            { "id": 25, "name": "Inverter", "color": "#7FFF00", "aggression": 0.5, "empathy": 0.5, "energy": 0.4 },
                            { "id": 26, "name": "Shifter", "color": "#9400D3", "aggression": 0.4, "empathy": 0.4, "energy": 0.7 },
                            { "id": 27, "name": "Pulse", "color": "#FF1493", "aggression": 0.1, "empathy": 0.1, "energy": 0.5 },
                            { "id": 28, "name": "Drifter", "color": "#00BFFF", "aggression": 0.2, "empathy": 0.5, "energy": 0.9 },
                            { "id": 29, "name": "Anomalous", "color": "#ADFF2F", "aggression": 0.6, "empathy": 0.6, "energy": 0.6 },
                            { "id": 30, "name": "Catalyst-X", "color": "#FF6347", "aggression": 1.0, "empathy": 1.0, "energy": 1.0 }
                        ]
                    },
                    {
                        "faction": "Inert",
                        "types": [
                            { "id": 31, "name": "Citizen", "color": "#B0C4DE", "aggression": 0.2, "empathy": 0.5, "energy": 0.3 },
                            { "id": 32, "name": "Wall", "color": "#4682B4", "aggression": 0.0, "empathy": 0.1, "energy": 0.0 },
                            { "id": 33, "name": "Skeptic", "color": "#708090", "aggression": 0.1, "empathy": 0.3, "energy": 0.2 },
                            { "id": 34, "name": "Follower", "color": "#87CEFA", "aggression": 0.1, "empathy": 0.5, "energy": 0.5 },
                            { "id": 35, "name": "Static", "color": "#ADD8E6", "aggression": 0.0, "empathy": 0.5, "energy": 0.1 },
                            { "id": 36, "name": "Anchor", "color": "#5F9EA0", "aggression": 0.1, "empathy": 0.6, "energy": 0.0 },
                            { "id": 37, "name": "Vessel", "color": "#E0FFFF", "aggression": 0.1, "empathy": 0.9, "energy": 0.4 },
                            { "id": 38, "name": "Drone", "color": "#6495ED", "aggression": 0.3, "empathy": 0.3, "energy": 0.6 },
                            { "id": 39, "name": "Buffer", "color": "#00CED1", "aggression": 0.0, "empathy": 0.5, "energy": 0.3 },
                            { "id": 40, "name": "The Average", "color": "#1E90FF", "aggression": 0.5, "empathy": 0.5, "energy": 0.5 }
                        ]
                    }
                ]
            };
            this.personalities = data.personalities.flatMap(p => p.types.map(t => ({ ...t, faction: p.faction })));
        }
    }

    async init() {
        await this.loadData();

        try {
            const resp = await fetch(`${this.backendUrl}/state`);
            if (resp.ok) {
                console.log("Connected to Python Physics Engine");
                this.log("Connected to Python Physics Engine.");
                this.isHybridMode = true;
            } else {
                throw new Error("Backend not OK");
            }
        } catch (e) {
            console.warn("Backend not found, falling back to Local JS Engine");
            this.log("Backend offline. Local JS physics activated.");
            this.isHybridMode = false;
        }

        await this.reset();
        this.animate();
    }

    async reset() {
        this.resize(); // Ensure canvas is sized correctly before resetting

        if (this.isHybridMode) {
            try {
                await fetch(`${this.backendUrl}/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        width: this.canvas.width,
                        height: this.canvas.height
                    })
                });
                this.log(`Physics Engine resized to ${this.canvas.width}x${this.canvas.height}`);
            } catch (e) {
                console.error("Reset failed:", e);
            }
        }

        this.agents = [];
        for (let i = 0; i < 500; i++) {
            const p = this.personalities[Math.floor(Math.random() * this.personalities.length)];
            this.agents.push(new Agent(i, p, Math.random() * this.canvas.width, Math.random() * this.canvas.height, this.canvas.width, this.canvas.height, this));
        }
        this.updateDashboard();
        this.render();
    }

    async updateFromBackend() {
        if (!this.isRunning || !this.isHybridMode || this.isSyncing) return;
        this.isSyncing = true;
        try {
            const resp = await fetch(`${this.backendUrl}/step?count=1`, { method: 'POST' });
            if (!resp.ok) throw new Error("Backend Error");
            const data = await resp.json();
            this.syncAgents(data);
        } catch (e) {
            console.error("Backend Sync Error:", e);
            this.isHybridMode = false;
            this.log("Lost connection to backend. Local fallback active.");
        } finally {
            this.isSyncing = false;
        }
    }

    syncAgents(data) {
        data.forEach((d, i) => {
            if (this.agents[i]) {
                this.agents[i].x = d.x;
                this.agents[i].y = d.y;
                this.agents[i].resource = d.resource;
                this.agents[i].energy = d.energy;
                this.agents[i].state = d.state;
                this.agents[i].radius = Math.max(2, 3 + (d.resource * 4));
                // Simple color sync for faction changes
                if (this.agents[i].personality.faction !== d.faction) {
                    const p = this.personalities.find(pers => pers.faction === d.faction);
                    if (p) {
                        this.agents[i].personality = { ...p };
                        this.agents[i].color = p.color;
                    }
                }
            }
        });
    }

    animate(time = 0) {
        const dt = (time - this.lastTime) / 16.67;
        this.lastTime = time;

        if (this.isRunning) {
            if (this.isHybridMode) {
                this.updateFromBackend();
            } else {
                this.update();
            }
        }

        this.render();
        this.updateDashboard();
        requestAnimationFrame((t) => this.animate(t));
    }

    update() {
        const dt = this.speed;
        const cellSize = 50;
        const grid = { cellSize, data: {} };
        this.agents.forEach(a => {
            if (a.isDeactivated) return;
            const key = `${Math.floor(a.x / cellSize)},${Math.floor(a.y / cellSize)}`;
            if (!grid.data[key]) grid.data[key] = [];
            grid.data[key].push(a);
        });
        if (this.isRunning) this.ticks++;
        this.agents.forEach(a => a.update(this.agents, dt, grid));
    }

    render() {
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // Clear screen!

        // DEBUG: Once per 100 frames, log status
        if (this.ticks % 100 === 0 && this.agents.length > 0) {
            const a = this.agents[0];
            console.log(`Render Debug: Canvas ${this.canvas.width}x${this.canvas.height}, Agent[0] at (${a.x.toFixed(1)}, ${a.y.toFixed(1)}), Color: ${a.color}`);
        }

        this.agents.forEach(a => {
            a.draw(this.ctx);
            if (this.isRunning && !a.isDeactivated && a.state === 'HUNT') {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                this.ctx.beginPath();
                const huntRadius = Math.max(2, a.radius);
                this.ctx.arc(a.x, a.y, huntRadius + 2, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        });
    }

    toggle() {
        this.isRunning = !this.isRunning;
        document.getElementById('startBtn').textContent = this.isRunning ? 'PAUSE SIMULATION' : 'RESUME SIMULATION';
        this.log(this.isRunning ? 'Reality sequence started...' : 'Reality paused.');
    }

    async triggerGlitch() {
        if (this.isHybridMode) {
            try {
                await fetch(`${this.backendUrl}/glitch`, { method: 'POST' });
                this.log('⚡ Glitch detected: Spatial coordinates rewritten.');
            } catch (e) {
                console.error("Glitch failed:", e);
            }
        } else {
            this.agents.forEach(a => {
                if (Math.random() < 0.2) {
                    a.x = Math.random() * this.canvas.width;
                    a.y = Math.random() * this.canvas.height;
                }
            });
            this.log('⚡ Glitch detected: Spatial coordinates rewritten.');
        }
    }

    async triggerObserver() {
        if (this.isHybridMode) {
            try {
                await fetch(`${this.backendUrl}/observer`, { method: 'POST' });
                this.log('👁️ Observer efffect: Quantum wave functions collapsed.');
            } catch (e) {
                console.error("Observer failed:", e);
            }
        }
    }

    log(msg) {
        const log = document.getElementById('simLog');
        const entry = document.createElement('p');
        entry.className = 'log-entry';
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        log.insertBefore(entry, log.firstChild);
    }

    updateDashboard() {
        const stats = { Entropics: 0, Luminaries: 0, Catalysts: 0, Inert: 0 };
        let activeCount = 0;
        let totalEnergy = 0;

        this.agents.forEach(a => {
            if (!a.isDeactivated) {
                stats[a.personality.faction]++;
                activeCount++;
                totalEnergy += a.energy;
            }
        });

        document.getElementById('popCount').textContent = `Agents: ${activeCount}`;
        document.getElementById('popCount').textContent = `Agents: ${activeCount}`;
        let entropy = activeCount > 0 ? 1 - (totalEnergy / activeCount) : 1;
        if (isNaN(entropy)) entropy = 0.5; // Fallback for safety
        document.getElementById('entropyLevel').textContent = `Entropy: ${(entropy).toFixed(2)}`;

        Object.keys(stats).forEach(f => {
            const pct = activeCount > 0 ? (stats[f] / activeCount) * 100 : 0;
            const row = document.querySelector(`.stat-row[data-faction="${f}"]`);
            if (row) {
                row.querySelector('.bar').style.width = `${pct}%`;
                row.querySelector('.value').textContent = `${Math.round(pct)}%`;
            }
        });

        const statusEl = document.getElementById('worldStatus');
        if (statusEl) {
            const phase = this.calculateWorldPhase(stats);
            statusEl.classList.remove('status-genesis', 'status-stable', 'status-chaos', 'status-dominion', 'status-collapse');
            statusEl.classList.add(`status-${phase.type}`);
            statusEl.textContent = `PHASE: ${phase.label}`;
        }
    }

    calculateWorldPhase(stats) {
        if (this.ticks < 500) return { type: 'genesis', label: '🌱 GENESIS' };

        const totalPop = Object.values(stats).reduce((a, b) => a + b, 0);
        if (totalPop < 100) return { type: 'collapse', label: '💀 COLLAPSE' };

        for (const [faction, count] of Object.entries(stats)) {
            if (count > totalPop * 0.5) return { type: 'dominion', label: `👑 ${faction.toUpperCase()} AGE` };
        }

        if (stats['Entropics'] > totalPop * 0.4) return { type: 'chaos', label: '🔥 CHAOS' };

        return { type: 'stable', label: '⚖️ STABLE' };
    }

    setupListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.toggle());
        document.getElementById('restartBtn').addEventListener('click', () => this.reset());
        document.getElementById('restartBtn').addEventListener('click', () => this.reset());
        document.getElementById('glitchBtn').addEventListener('click', () => this.triggerGlitch());
        document.getElementById('observerBtn').addEventListener('click', () => this.triggerObserver());
        document.getElementById('speedSlider').addEventListener('input', (e) => this.speed = parseFloat(e.target.value));

        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.dashboard').classList.add('active');
        });

        document.getElementById('sidebarClose').addEventListener('click', () => {
            document.querySelector('.dashboard').classList.remove('active');
        });

        const modal = document.getElementById('infoModal');
        document.getElementById('infoBtn').addEventListener('click', () => modal.style.display = 'block');
        document.querySelector('.close-btn').addEventListener('click', () => modal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

        // World Modifiers Listeners
        ['Agreement', 'Empathy', 'Energy'].forEach(trait => {
            const id = `global${trait}`;
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value);
                    this.weights[trait.toLowerCase()] = val;
                    document.getElementById(`val-${trait.toLowerCase()}`).textContent = `${val.toFixed(1)}x`;
                });
            }
        });
        // Typo in array above, fixing manually for specific IDs
        document.getElementById('globalAggression').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.weights.aggression = val;
            document.getElementById('val-aggression').textContent = `${val.toFixed(1)}x`;
        });

        // Legend Modal
        const legendModal = document.getElementById('legendModal');
        document.getElementById('legendBtn').addEventListener('click', () => {
            this.populateLegend();
            legendModal.style.display = 'block';
        });
        document.querySelector('.close-btn-legend').addEventListener('click', () => legendModal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === legendModal) legendModal.style.display = 'none'; });
    }

    async populateLegend() {
        const container = document.getElementById('legendContainer');
        container.innerHTML = ''; // Force clear to prevent stale/empty states

        if (this.personalities.length === 0) {
            // Try to reload if empty
            await this.loadData();
            if (this.personalities.length === 0) {
                container.innerHTML = '<p style="color:red">Error: No personality data loaded.</p>';
                return;
            }
        }

        const factions = ['Entropics', 'Luminaries', 'Catalysts', 'Inert'];

        factions.forEach(faction => {
            const group = document.createElement('div');
            group.className = 'legend-faction-group';

            const title = document.createElement('h4');
            title.textContent = faction;
            if (faction === 'Entropics') title.style.color = 'var(--entropic-color)';
            if (faction === 'Luminaries') title.style.color = 'var(--luminary-color)';
            if (faction === 'Catalysts') title.style.color = 'var(--catalyst-color)';
            if (faction === 'Inert') title.style.color = 'var(--inert-color)';
            group.appendChild(title);

            const factionTypes = this.personalities.filter(p => p.faction === faction);
            factionTypes.forEach(type => {
                const item = document.createElement('div');
                item.className = 'legend-item';

                const swatch = document.createElement('div');
                swatch.className = 'color-swatch';
                swatch.style.backgroundColor = type.color;

                // Add halo for high empathy
                if (type.empathy > 0.8) {
                    swatch.style.boxShadow = `0 0 4px ${type.color}`;
                }

                const name = document.createElement('span');
                name.textContent = type.name;

                item.appendChild(swatch);
                item.appendChild(name);
                group.appendChild(item);
            });

            container.appendChild(group);
        });
    }

    generateReport() {
        const stats = { Entropics: 0, Luminaries: 0, Catalysts: 0, Inert: 0 };
        let activeCount = 0;

        this.agents.forEach(a => {
            if (!a.isDeactivated) {
                stats[a.personality.faction]++;
                activeCount++;
            }
        });

        if (activeCount === 0) return "The simulation is empty. Life has not yet begun (or has ended).";

        const pEntropics = Math.round((stats.Entropics / activeCount) * 100);
        const pLuminaries = Math.round((stats.Luminaries / activeCount) * 100);
        const pCatalysts = Math.round((stats.Catalysts / activeCount) * 100);
        const pInert = Math.round((stats.Inert / activeCount) * 100);

        let report = `🌍 **World Status Report**\n\n`;

        // 1. Dominance Check
        if (pEntropics > 50) {
            report += `🔥 **Darkness Reigns**: The **Entropics** have crushed the opposition and control ${pEntropics}% of the population. It is a hostile world.\n`;
        } else if (pLuminaries > 50) {
            report += `✨ **Age of Light**: The **Luminaries** are prospering, accounting for ${pLuminaries}% of life. Cooperation is the dominant strategy.\n`;
        } else if (pInert > 50) {
            report += `💤 **Stagnation**: The **Inert** masses (${pInert}%) have overpopulated the system. Evolution has stalled.\n`;
        } else if (pCatalysts > 30) {
            report += `🌪️ **Chaos Theory**: The **Catalysts** (${pCatalysts}%) are causing massive instability. The world is unpredictable.\n`;
        } else {
            report += `⚖️ **Balance of Power**: No single faction dominates. The world is in a delicate equilibrium.\n`;
        }

        report += `\n`;

        // 2. Extinction Check
        const extinct = [];
        if (pEntropics === 0) extinct.push("Entropics");
        if (pLuminaries === 0) extinct.push("Luminaries");
        if (pCatalysts === 0) extinct.push("Catalysts");
        if (pInert === 0) extinct.push("Inert");

        if (extinct.length > 0) {
            report += `💀 **Extinction Event**: The ${extinct.join(', ')} faction(s) have been completely wiped out.\n`;
        }

        // 3. Phase Analysis
        const phase = this.calculateWorldPhase(stats);
        report += `\n⏳ **Current Phase**: ${phase.label} (${phase.type.toUpperCase()})\n`;

        return report;
    }

    setupListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.toggle());
        document.getElementById('restartBtn').addEventListener('click', () => this.reset());
        document.getElementById('glitchBtn').addEventListener('click', () => this.triggerGlitch());
        document.getElementById('observerBtn').addEventListener('click', () => this.triggerObserver());
        document.getElementById('speedSlider').addEventListener('input', (e) => this.speed = parseFloat(e.target.value));

        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.dashboard').classList.add('active');
        });

        document.getElementById('sidebarClose').addEventListener('click', () => {
            document.querySelector('.dashboard').classList.remove('active');
        });

        const modal = document.getElementById('infoModal');
        document.getElementById('infoBtn').addEventListener('click', () => modal.style.display = 'block');
        document.querySelector('.close-btn').addEventListener('click', () => modal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

        // World Modifiers Listeners
        ['Agreement', 'Empathy', 'Energy'].forEach(trait => {
            const id = `global${trait}`;
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value);
                    this.weights[trait.toLowerCase()] = val;
                    document.getElementById(`val-${trait.toLowerCase()}`).textContent = `${val.toFixed(1)}x`;
                });
            }
        });
        // Typo in array above, fixing manually for specific IDs
        document.getElementById('globalAggression').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.weights.aggression = val;
            document.getElementById('val-aggression').textContent = `${val.toFixed(1)}x`;
        });

        // Legend Modal
        const legendModal = document.getElementById('legendModal');
        document.getElementById('legendBtn').addEventListener('click', () => {
            this.populateLegend();
            legendModal.style.display = 'block';
        });
        document.querySelector('.close-btn-legend').addEventListener('click', () => legendModal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === legendModal) legendModal.style.display = 'none'; });

        // Report Modal
        const reportModal = document.getElementById('reportModal');
        document.getElementById('reportBtn').addEventListener('click', () => {
            console.log("Report Button Clicked! Generating report..."); // DEBUG
            const reportText = this.generateReport();
            console.log("Report Text:", reportText); // DEBUG

            // Convert simple markdown-like bold to HTML
            const htmlText = reportText.replace(/\*\*(.*?)\*\*/g, '<span class="report-highlight">$1</span>').replace(/\n/g, '<br>');
            document.getElementById('reportContainer').innerHTML = htmlText;
            reportModal.style.display = 'block';
            console.log("Modal display set to block"); // DEBUG
        });
        document.querySelector('.close-btn-report').addEventListener('click', () => reportModal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === reportModal) reportModal.style.display = 'none'; });
    }

    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }
}

const sim = new Simulation();
