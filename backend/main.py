from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from model import SocialModel
import json
import os

app = FastAPI()

# Mount static files (Simulation Frontend)
# This allows opening http://localhost:8000/ to avoid CORS issues
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..")), name="static")

# Enable CORS for local file access (file://)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "null"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global simulation state
sim_model = None

# Load personalities
PERS_PATH = os.path.join(os.path.dirname(__file__), "..", "personalities.json")
with open(PERS_PATH, "r") as f:
    PERSONALITIES = json.load(f)

@app.on_event("startup")
def startup_event():
    global sim_model
    # Flatten personality list
    flat_personalities = []
    for faction_entry in PERSONALITIES.get("personalities", []):
        faction_name = faction_entry.get("faction")
        for p in faction_entry.get("types", []):
            p["faction"] = faction_name
            flat_personalities.append(p)
            
    sim_model = SocialModel(800, 600, flat_personalities)

@app.get("/state")
def get_state():
    if sim_model:
        return sim_model.get_state()
    return []

@app.post("/step")
def step(count: int = 1):
    global sim_model
    if sim_model:
        for _ in range(count):
            sim_model.step()
        return sim_model.get_state()
    return []

@app.post("/glitch")
def glitch():
    global sim_model
    if sim_model:
        sim_model.trigger_glitch()
        return {"status": "glitched"}
    return {"status": "error"}

@app.post("/observer")
def observer():
    global sim_model
    if sim_model:
        sim_model.trigger_observer()
        return {"status": "observed"}
    return {"status": "error"}

from pydantic import BaseModel

class ResetParams(BaseModel):
    width: int = 800
    height: int = 600

@app.post("/reset")
def reset(params: ResetParams):
    global sim_model
    # Flatten personality list for reset
    flat_personalities = []
    for faction_entry in PERSONALITIES.get("personalities", []):
        faction_name = faction_entry.get("faction")
        for p in faction_entry.get("types", []):
            p["faction"] = faction_name
            flat_personalities.append(p)
    
    sim_model = SocialModel(params.width, params.height, flat_personalities)
    return {"status": "reset", "width": params.width, "height": params.height}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8021)
