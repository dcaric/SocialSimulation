/**
 * Social Simulation Engine
 * Handles agent behavior, physics, and interactions.
 */

class Agent {
    constructor(id, personality, x, y, canvasWidth, canvasHeight) {
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

        // Stats
        this.energy = 1.0;
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
        const speed = (this.personality.energy || 0.5) * 2;
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
        const speed = (this.personality.energy || 0.5) * 2;
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
            if (this.personality.aggression > other.personality.empathy) {
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
                if (this.personality.empathy > other.personality.aggression) {
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
        }
        this.radius = 3 + (this.resource * 4);
    }

    convertToEntropic(sourcePersonality) {
        this.personality.faction = "Entropics";
        this.color = sourcePersonality.color;
        this.personality.aggression = Math.max(0.5, this.personality.aggression);
        this.energy = 0.5;
    }

    convertToLuminary(sourcePersonality) {
        this.personality.faction = "Luminaries";
        this.color = sourcePersonality.color;
        this.personality.empathy = Math.max(0.7, this.personality.empathy);
    }

    convertToInert() {
        this.personality.faction = "Inert";
        this.color = "#808080";
        this.personality.aggression = 0.1;
        this.personality.energy = 0.2;
    }

    draw(ctx) {
        if (this.isDeactivated) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
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
    }

    async loadData() {
        // Embedded Data (Source of truth for frontend)
        const data = {
            "personalities": [
                {
                    "faction": "Entropics",
                    "types": [
                        { "id": 1, "name": "The Void", "color": "#000000", "aggression": 1.0, "empathy": 0.0, "energy": 0.2 },
                        { "id": 2, "name": "Berserker", "color": "#1A0000", "aggression": 0.9, "empathy": 0.1, "energy": 0.9 },
                        { "id": 3, "name": "Leech", "color": "#222222", "aggression": 0.4, "empathy": 0.2, "energy": 0.4 },
                        { "id": 4, "name": "Shadow", "color": "#333333", "aggression": 0.2, "empathy": 0.1, "energy": 0.7 },
                        { "id": 5, "name": "Corruptor", "color": "#050505", "aggression": 0.8, "empathy": 0.0, "energy": 0.5 },
                        { "id": 6, "name": "Viral", "color": "#0A0A0A", "aggression": 0.7, "empathy": 0.1, "energy": 0.8 },
                        { "id": 7, "name": "Nihilist", "color": "#111111", "aggression": 0.3, "empathy": 0.0, "energy": 0.1 },
                        { "id": 8, "name": "Specter", "color": "#1C1C1C", "aggression": 0.5, "empathy": 0.1, "energy": 0.6 },
                        { "id": 9, "name": "Obsidian", "color": "#020202", "aggression": 0.1, "empathy": 0.0, "energy": 0.0 },
                        { "id": 10, "name": "Reaper", "color": "#000005", "aggression": 0.9, "empathy": 0.0, "energy": 1.0 }
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
                        { "id": 31, "name": "Citizen", "color": "#808080", "aggression": 0.2, "empathy": 0.5, "energy": 0.3 },
                        { "id": 32, "name": "Wall", "color": "#444444", "aggression": 0.0, "empathy": 0.1, "energy": 0.0 },
                        { "id": 33, "name": "Skeptic", "color": "#A9A9A9", "aggression": 0.1, "empathy": 0.3, "energy": 0.2 },
                        { "id": 34, "name": "Follower", "color": "#D3D3D3", "aggression": 0.1, "empathy": 0.5, "energy": 0.5 },
                        { "id": 35, "name": "Static", "color": "#696969", "aggression": 0.0, "empathy": 0.5, "energy": 0.1 },
                        { "id": 36, "name": "Anchor", "color": "#2F4F4F", "aggression": 0.1, "empathy": 0.6, "energy": 0.0 },
                        { "id": 37, "name": "Vessel", "color": "#BEBEBE", "aggression": 0.1, "empathy": 0.9, "energy": 0.4 },
                        { "id": 38, "name": "Drone", "color": "#778899", "aggression": 0.3, "empathy": 0.3, "energy": 0.6 },
                        { "id": 39, "name": "Buffer", "color": "#708090", "aggression": 0.0, "empathy": 0.5, "energy": 0.3 },
                        { "id": 40, "name": "The Average", "color": "#777777", "aggression": 0.5, "empathy": 0.5, "energy": 0.5 }
                    ]
                }
            ]
        };
        this.personalities = data.personalities.flatMap(p => p.types.map(t => ({ ...t, faction: p.faction })));
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
            this.agents.push(new Agent(i, p, Math.random() * this.canvas.width, Math.random() * this.canvas.height, this.canvas.width, this.canvas.height));
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
                this.agents[i].radius = 3 + (d.resource * 4);
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
        this.agents.forEach(a => a.update(this.agents, dt, grid));
    }

    render() {
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.agents.forEach(a => {
            a.draw(this.ctx);
            if (this.isRunning && !a.isDeactivated && a.state === 'HUNT') {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                this.ctx.beginPath();
                this.ctx.arc(a.x, a.y, a.radius + 2, 0, Math.PI * 2);
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
        const entropy = activeCount > 0 ? 1 - (totalEnergy / activeCount) : 1;
        document.getElementById('entropyLevel').textContent = `Entropy: ${entropy.toFixed(2)}`;

        Object.keys(stats).forEach(f => {
            const pct = activeCount > 0 ? (stats[f] / activeCount) * 100 : 0;
            const row = document.querySelector(`.stat-row[data-faction="${f}"]`);
            if (row) {
                row.querySelector('.bar').style.width = `${pct}%`;
                row.querySelector('.value').textContent = `${Math.round(pct)}%`;
            }
        });
    }

    setupListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.toggle());
        document.getElementById('restartBtn').addEventListener('click', () => this.reset());
        document.getElementById('restartBtn').addEventListener('click', () => this.reset());
        document.getElementById('glitchBtn').addEventListener('click', () => this.triggerGlitch());
        document.getElementById('observerBtn').addEventListener('click', () => this.triggerObserver());
        document.getElementById('speedSlider').addEventListener('input', (e) => this.speed = parseFloat(e.target.value));

        const modal = document.getElementById('infoModal');
        document.getElementById('infoBtn').addEventListener('click', () => modal.style.display = 'block');
        document.querySelector('.close-btn').addEventListener('click', () => modal.style.display = 'none');
        window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }
}

const sim = new Simulation();
