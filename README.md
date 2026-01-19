# Digital Twin for Disasters

[![Python](https://img.shields.io/badge/Python-3.13.5-blue)](https://www.python.org/downloads/release/python-3135/)
[![Node.js](https://img.shields.io/badge/Node.js-25.2.1-green)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-11.6.2-red)](https://www.npmjs.com/)

<!-- 🚧 SUMAMARY NEEDED 🚧 -->
## Summary
This project is a Digital Twin platform for disaster modeling and visualization, currently focused on wildfire simulation with an extensible design for future disaster types.

Wildfire simulations are generated using a stochastic cellular automata (SCA) model and represented as GeoTIFF (.tif) raster files. The system integrates Google Earth Engine for geospatial data access, including land cover data from Dynamic World V1, and uses Google Cloud Storage (GCS) for managing simulation and raster outputs.

Simulation results are visualized on an interactive map interface using Leaflet and georaster-layer-for-leaflet for simple implementation of the simulation.

## System Requirements

As of 12/30/2025, this project is run on:
- Windows 10/11
- Python 3.13.5
- Node v25.2.1
- npm 11.6.2

There are yet to have a Linux/MacOS equivalent of the following instructions, the reader will have to experiment for now.

## Running the Demo Locally

### 1. Clone the repository

```bash
# https
git clone https://github.com/rfoo1250/digital-twin-disaster-proto.git
# git
git clone git@github.com:rfoo1250/digital-twin-disaster-proto.git
# goto dir
cd digital-twin-disaster-proto
```

### 2. Install requirements

Before installing anything, it is recommended to keep a healthy environment and use virtual environments.

- For the Python Flask backend:
    - Create a Python virtual environment ([guides](https://docs.python.org/3/library/venv.html)).
    - Install required libraries:
    ```bash
    pip install -r py/requirements.txt
    ```

- For the JavaScript Vite frontend, do:
    - Create a Node virtual environment ([guides](https://github.com/ekalinin/nodeenv)).
    ```bash
    # make sure the package.json file is in the current directory
    npm install
    ```

This project uses Google Earth Engine and Google Cloud Storage services, which explicitly state that authentication is required for a Google account (preferrably a shared, company account, or your personal one that is only for testing).

1. Ensure that you have access to a Google account that is in a project with Google Earth Engine API and Python API, other API services are optional.
2. Create a service account and get its service account key. Please follow [this link](https://docs.cloud.google.com/iam/docs/keys-create-delete#iam-service-account-keys-create-console).
3. Please place the private key into a safe location. For example, `secrets/[key].json`.
4. Add the key to your USER PATH.
4a. You can add it via System Properties > Advanced > Environment Variables > User Variables for User > New... add Variable Name as "GOOGLE_APPLICATION_CREDENTIALS" and paste the path to the key in Variable Path.
4b. or you can add directly via Windows Command Prompt / Powershell
```cmd
# use setx
setx GOOGLE_APPLICATION_CREDENTIALS "C:\path\to\your\service-account-key.json" /M
# close terminal and open a new one to verify
echo %GOOGLE_APPLICATION_CREDENTIALS%
```

It is also recommended to install Google Cloud CLI ([instructions](https://docs.cloud.google.com/sdk/docs/install-sdk)). They have an installer or you can manually perform installation via terminal.

If there is anything missing from these authentication instructions, please reach out to [contacts](#contacts).

### 3. Run the Flask app as a backend

```bash
python py/app.py
```

### 4. Host the client

```bash
npm run dev
```

The following is outdated as of 12/1/2025 but is kept as legacy.
1. Open another terminal and host via Python's HTTP server
```bash
cd Disaster_bench_dashboard
python -m http.server 8000
```

2. Host via VSCode's Live Server extension
- Install and activate Live Server by Ritwick Dey.
- `cd Disaster_bench_dashboard`
- Follow the instructions by the dev to launch a client session.

Then, go to your localhost's port via a web browser.

## Instructions on Digital Twin
### Running a Simulation

1. **Initial Interface**
   - Upon loading the application, you will see an interactive **map interface** with control panels.
   - The map is used both to **select a county** and to **display wildfire simulation results**.

2. **Select and Focus on a County**
   - Select a county on the map.
   - Click **“Focus on County”** to zoom into the selected area.
   - This action automatically loads and displays the **Dynamic World land cover layer** for the selected county.

3. **Set an Ignition Point**
   - Click **“Set Ignition Point”**.
   - Click a location within the focused county to define the ignition point  
     *(preferably on vegetated regions shown in Dynamic World)*.
   - A marker will appear on the map once the ignition point is successfully set.

4. **Start the Simulation**
   - Ensure the ignition point is set and the Dynamic World layer is enabled.
   - Click **“Start Simulation”** to begin the wildfire simulation.
   - Simulation execution may take some time.
     - Once completed, a notification will appear.
     - The simulation will automatically load on the map.

5. **Navigate Simulation Frames**
   - The wildfire simulation is displayed as an animation with **1-second intervals between frames**.
   - Playback controls allow you to:
     - Rewind
     - Step forward
     - Revisit specific frames
   - Zooming in may be necessary to clearly observe fire spread progression.

### Additional Controls and Notes

- **Layer Management**
  - Hover over the **“Base Layers”** menu to enable or disable map layers.

- **Reset Focus**
  - The **“Reset Focus”** button:
    - Returns the map to its default view
    - Disables the county highlight
    - Disables the Dynamic World layer

- **Remove Ignition Point**
  - Use **“Remove Ignition Point”** to clear the current ignition marker and select a new location.


1/5/2026 - images needed to illustrate steps

## Technicalities
This project maintains its logs of erros, bugs, and fixes on [Github's internal Issues page](https://github.com/rfoo1250/digital-twin-disaster-proto/issues).

---

### Contacts
Primary contact:
rfoo1@asu.edu
Secondary contact:
svishnu6@asu.edu