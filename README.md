# Digital Twin for Disasters

🚧 SUMAMARY NEEDED 🚧


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

## Technicalities
This project maintains its logs of erros, bugs, and fixes on [Github's internal Issues page](https://github.com/rfoo1250/digital-twin-disaster-proto/issues).

---

### Contacts
Primary contact:
rfoo1@asu.edu
Secondary contact:
svishnu6@asu.edu