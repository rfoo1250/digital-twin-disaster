# Digital Twin for Disasters

🚧 CHANGES NEEDED 🚧
npm init -y for vite usage
new package and package-lock
new users should have node or a nodeenv (from python's pip)
`npm install` for frontned setup

## Running the Demo Locally

### 1. Clone the repository

```bash
git clone https://github.com/GoelUmang/Disaster_bench_dashboard.git
cd Disaster_bench_dashboard
```

### 2. Install requirements

```bash
pip install -r py/requirements.txt
```

TODO: add Google json key, need do listed in [Update README #14](https://github.com/rfoo1250/digital-twin-disaster-proto/issues/14)


### 3. Run the Flask app as a backend

```bash
python py/app.py
```

### 4. Host the client

You can either:
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
 
---

Primary contact:
rfoo1@asu.edu
Secondary contact:
svishnu6@asu.edu