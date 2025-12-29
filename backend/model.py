import mesa
import random
import math

class SocialAgent(mesa.Agent):
    """An agent with a personality and social physics logic."""
    def __init__(self, model, personality):
        super().__init__(model)
        self.personality = personality
        self.energy = 1.0
        self.resource = 0.5
        self.state = "IDLE"
        self.radius = 4
        self.isDeactivated = False
        
        # Motion properties
        self.speed = (personality.get("energy", 0.5)) * 2
        # Velocity vector
        angle = random.uniform(0, math.pi * 2)
        self.vx = math.cos(angle) * self.speed
        self.vy = math.sin(angle) * self.speed
        
    def step(self):
        if self.energy <= 0:
            self.convert_to_inert()
            return

        self.energy -= 0.00005
        self.think()
        self.move()

    def think(self):
        # In Mesa 3.0, grid is accessible via self.model.grid
        neighbors = self.model.grid.get_neighbors(self.pos, radius=60)
        if not neighbors:
            self.state = "IDLE"
            return

        target = None
        threat = None
        
        for other in neighbors:
            if other == self:
                continue
            dist = self.model.grid.get_distance(self.pos, other.pos)
            
            # Faction logic
            if self.personality["faction"] == "Entropics":
                if other.personality["faction"] in ["Luminaries", "Inert"]:
                    if not target or dist < self.model.grid.get_distance(self.pos, target.pos):
                        target = other
            elif self.personality["faction"] == "Luminaries":
                if other.personality["faction"] == "Entropics":
                    if not threat or dist < self.model.grid.get_distance(self.pos, threat.pos):
                        threat = other
                elif other.personality["faction"] in ["Inert", "Luminaries"]:
                    if not target or dist < self.model.grid.get_distance(self.pos, target.pos):
                        target = other
            elif self.personality["faction"] == "Inert":
                if other.personality["faction"] == "Entropics":
                    if not threat or dist < self.model.grid.get_distance(self.pos, threat.pos):
                        threat = other

        if threat:
            self.state = "FLEE"
            self.steer_away(threat)
        elif target:
            self.state = "HUNT"
            self.steer_toward(target)
        else:
            self.state = "IDLE"
            
        self.process_collisions(neighbors)

    def move(self):
        # Update position based on velocity
        new_pos = (
            (self.pos[0] + self.vx) % self.model.grid.width,
            (self.pos[1] + self.vy) % self.model.grid.height
        )
        self.model.grid.move_agent(self, new_pos)

    def get_direction(self, target_pos):
        dx = target_pos[0] - self.pos[0]
        dy = target_pos[1] - self.pos[1]
        
        # Torus logic: shift if distance is more than half the dimension
        if abs(dx) > self.model.grid.width / 2:
            dx = -math.copysign(self.model.grid.width - abs(dx), dx)
        if abs(dy) > self.model.grid.height / 2:
            dy = -math.copysign(self.model.grid.height - abs(dy), dy)
            
        return dx, dy

    def steer_toward(self, target):
        dx, dy = self.get_direction(target.pos)
        mag = math.sqrt(dx*dx + dy*dy)
        if mag > 0:
            # Gradually adjust velocity
            target_vx = (dx / mag) * self.speed
            target_vy = (dy / mag) * self.speed
            self.vx += (target_vx - self.vx) * 0.1
            self.vy += (target_vy - self.vy) * 0.1

    def steer_away(self, threat):
        # Direction from threat to self
        tdx, tdy = self.get_direction(threat.pos)
        dx, dy = -tdx, -tdy
        mag = math.sqrt(dx*dx + dy*dy)
        if mag > 0:
            target_vx = (dx / mag) * self.speed * 1.5
            target_vy = (dy / mag) * self.speed * 1.5
            self.vx += (target_vx - self.vx) * 0.1
            self.vy += (target_vy - self.vy) * 0.1

    def process_collisions(self, neighbors):
        for other in neighbors:
            if other == self: continue
            if self.model.grid.get_distance(self.pos, other.pos) < (self.radius + other.radius):
                self.handle_interaction(other)

    def handle_interaction(self, other):
        faction = self.personality["faction"]
        other_faction = other.personality["faction"]

        if faction == "Entropics":
            if self.personality["aggression"] > other.personality["empathy"]:
                drain = 0.01
                other.resource -= drain
                self.resource += drain
                self.energy = min(1.0, self.energy + 0.1)
                
                if other.resource <= 0:
                    other.convert_to_entropic(self.personality)
        elif faction == "Luminaries":
            if other_faction == "Inert":
                other.convert_to_luminary(self.personality)

    def convert_to_inert(self):
        # Update personality to Inert
        for p in self.model.personalities:
            if p["faction"] == "Inert":
                self.personality = p
                self.resource = 0.5
                break

    def convert_to_entropic(self, source_p):
        self.personality = source_p
        self.resource = 0.2

    def convert_to_luminary(self, source_p):
        self.personality = source_p
        self.resource = 0.5

class SocialModel(mesa.Model):
    """The social simulation model."""
    def __init__(self, width, height, personalities):
        super().__init__()
        self.grid = mesa.space.ContinuousSpace(width, height, True)
        self.personalities = personalities
        
        # Create agents
        for i in range(500):
            p = random.choice(personalities)
            a = SocialAgent(self, p)
            self.agents.add(a)
            x = random.uniform(0, width)
            y = random.uniform(0, height)
            self.grid.place_agent(a, (x, y))

    def step(self):
        self.agents.shuffle_do("step")

    def trigger_glitch(self):
        # Teleport 20% of agents
        target_count = int(len(self.agents) * 0.2)
        import random
        targets = random.sample(list(self.agents), target_count)
        for a in targets:
            new_x = random.uniform(0, self.grid.width)
            new_y = random.uniform(0, self.grid.height)
            self.grid.move_agent(a, (new_x, new_y))

    def trigger_observer(self):
        # Freeze all momentum (Quantum Collapse)
        for a in self.agents:
            a.vx = 0
            a.vy = 0
            a.state = "IDLE"
        
    def get_state(self):
        return [{
            "id": a.unique_id,
            "personality_id": a.personality["id"],
            "x": a.pos[0],
            "y": a.pos[1],
            "faction": a.personality["faction"],
            "energy": a.energy,
            "resource": a.resource,
            "name": a.personality["name"],
            "color": a.personality["color"],
            "state": a.state,
            "is_deactivated": a.isDeactivated
        } for a in self.agents]
