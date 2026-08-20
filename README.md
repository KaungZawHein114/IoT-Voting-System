# GUSTO IoT Show Management

Backend API for managing IoT Project Shows at GUSTO College.

## Tech Stack

- Node.js
- Express.js
- MongoDB
- MongoDB Atlas
- Mongoose
- MVC architecture

## Current Features

- Create a project show
- Read all project shows
- Use a local MongoDB database in development
- Use MongoDB Atlas in production

## Project Structure

```text
gusto-iot-show-management/
├── app.js
├── server.js
├── config.env
├── controllers/
├── models/
├── routes/
├── utils/
├── package.json
└── package-lock.json
```

## Requirements

Install these before starting:

- Node.js
- npm
- Git
- MongoDB Community Server for local development
- A MongoDB Atlas account for the cloud database

MongoDB Compass is optional. It is useful for viewing and managing database data, but it does not run the local MongoDB server.

## 1. Clone the Repository

Open Terminal on macOS or PowerShell / Command Prompt on Windows.

```bash
git clone https://github.com/eddie-sin/gusto-iot-show-management.git
```

Enter the project folder:

```bash
cd gusto-iot-show-management
```

Because this is a private repository, GitHub may ask you to sign in or authenticate before cloning.

## 2. Install Packages

Run:

```bash
npm install
```

This installs all packages listed in `package.json`.

## 3. Create `config.env`

Create a file named:

```text
config.env
```

Place it in the project root beside `app.js` and `server.js`.

Use this structure:

```env
PORT=5001

DATABASE_LOCAL=mongodb://127.0.0.1:27017/gusto_iot_show_dev

DATABASE=mongodb+srv://YOUR_USERNAME:<db_password>@YOUR_CLUSTER_ADDRESS.mongodb.net/gusto_iot_show?retryWrites=true&w=majority

DATABASE_PASSWORD=YOUR_ATLAS_DATABASE_PASSWORD

JWT_SECRET=use_a_long_random_secret_at_least_32_characters
JWT_EXPIRES_IN=7d

# Optional in development; set this to the public HTTPS origin in production.
PUBLIC_BASE_URL=http://localhost:5001
VOTING_TIMEZONE_OFFSET=+06:30

# One-time Academic Head account setup only
ADMIN_FULL_NAME=Academic Head Name
ADMIN_EMAIL=academic.head@gusto.edu.mm
ADMIN_PASSWORD=replace_with_a_long_unique_password
```

Replace:

- `YOUR_USERNAME` with your Atlas database username
- `YOUR_CLUSTER_ADDRESS` with the address from your Atlas connection string
- `YOUR_ATLAS_DATABASE_PASSWORD` with your Atlas database-user password

Keep `<db_password>` inside the `DATABASE` value. The application replaces it with `DATABASE_PASSWORD`.

Do not upload `config.env` to GitHub.

Make sure `.gitignore` includes:

```gitignore
node_modules/
config.env
.DS_Store
```

## 4. Run in Development Mode

Development mode uses the local MongoDB database:

```text
gusto_iot_show_dev
```

### macOS

Make sure MongoDB Community Server is running, then run:

```bash
npm run dev
```

### Windows

Make sure the MongoDB service is running, then run:

```bash
npm run dev
```

Expected output:

```text
Using local MongoDB
Database connection successful
Server running on port 5001 in development mode
```

The API will be available at:

```text
http://localhost:5001
```

## 5. Run in Production Mode

Production mode connects to MongoDB Atlas.

Before running it:

1. Open MongoDB Atlas.
2. Go to **Database & Network Access**.
3. Add your current IP address.
4. Confirm that your Atlas database user exists.
5. Confirm that the Atlas connection details in `config.env` are correct.

Run:

```bash
npm run prod
```

This command is the same on macOS and Windows.

Expected output:

```text
Using MongoDB Atlas
Database connection successful
Server running on port 5001 in production mode
```

Running `npm run prod` on your computer does not deploy the API. It runs the API locally while using the cloud MongoDB Atlas database.

## API Routes

### Authentication and Academic Head user management

Create the single Academic Head account once with the included local setup
script. It is not an API route. Fill in `ADMIN_FULL_NAME`, `ADMIN_EMAIL`, and
`ADMIN_PASSWORD` in `config.env`, then run `npm run create:academic-head`.
The script refuses to create a second account using the same email and hashes
the password safely. Remove the three `ADMIN_*` values from `config.env` after
the account has been created.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | Public | Login as an active admin or manager. |
| POST | `/api/v1/users` | ADMIN | Create a manager account. |
| GET | `/api/v1/users` | ADMIN | List managers with `fullName`, `email`, and `status`. |
| GET | `/api/v1/users/:id` | ADMIN | Get one manager with `fullName`, `email`, `status`, and `createdAt`. |
| PATCH | `/api/v1/users/:id` | ADMIN | Update a manager's `fullName`, `email`, or `status`. |
| PATCH | `/api/v1/users/:id/password` | ADMIN | Reset a manager password. |
| PATCH | `/api/v1/users/:id/status` | ADMIN | Set a manager to `ACTIVE` or `DISABLED`. Managers with draft or active projects cannot be disabled. |
| DELETE | `/api/v1/users/:id` | ADMIN | Delete a manager account. |

For every ADMIN route, send the login token as an HTTP header:

```text
Authorization: Bearer YOUR_JWT_TOKEN
```

### Project-show voting

The assigned manager controls publication, schedule overrides, and the live QR
display from the Voting tab inside a project. Publishing requires complete show
information, at least two active groups, and at least two complete voting
categories.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/projects/:id/publish` | ADMIN or assigned MANAGER | Validate and publish the project show. |
| POST | `/api/v1/projects/:id/unpublish` | ADMIN or assigned MANAGER | Unpublish before voting opens. |
| PATCH | `/api/v1/projects/:id/voting-mode` | ADMIN or assigned MANAGER | Use `SCHEDULED`, `FORCED_OPEN`, or `FORCED_CLOSED`. |
| POST | `/api/v1/projects/:id/qr-token` | ADMIN or assigned MANAGER | Generate a five-second single-use QR token. |
| GET | `/vote/:batch` | Approved voting session | Open the protected voting website. |
| POST | `/api/v1/voting/:batch/admit` | Live QR token | Exchange a QR token for an HTTP-only voting session. |
| POST | `/api/v1/voting/:batch/votes` | Approved voting session | Submit one complete ballot. |

When testing with a phone on the same network, either open the manager panel
through the laptop's LAN address or set `PUBLIC_BASE_URL` to that reachable
address. In production, set it to the public HTTPS origin.

### Read all project shows

```http
GET /api/v1/project-shows
```

Full local URL:

```text
http://localhost:5001/api/v1/project-shows
```

### Create a project show

```http
POST /api/v1/project-shows
```

Full local URL:

```text
http://localhost:5001/api/v1/project-shows
```

Example JSON body:

```json
{
  "batch": "HND-57",
  "theme": "Smart City",
  "date": null,
  "place": null,
  "startTime": null,
  "endTime": null,
  "groups": [
    {
      "title": "Smart Energy Monitoring",
      "groupNumber": "Group-1",
      "members": [
        "Aung Aung",
        "Su Su"
      ],
      "description": "An IoT system that monitors electricity usage."
    }
  ],
  "votingCategories": [
    {
      "name": "Most Innovative",
      "question": "Which project has the most original idea?"
    }
  ]
}
```

## Testing with Bruno

Start the server first:

```bash
npm run dev
```

Then create these requests in Bruno:

```text
GET  http://localhost:5001/api/v1/project-shows
POST http://localhost:5001/api/v1/project-shows
```

For the POST request:

1. Open the **Body** tab.
2. Select **JSON**.
3. Paste the example JSON body.
4. Click **Send**.

## Useful Commands

Install packages:

```bash
npm install
```

Run with local MongoDB:

```bash
npm run dev
```

Run with MongoDB Atlas:

```bash
npm run prod
```

Stop the server:

```text
Ctrl + C
```

Check changed Git files:

```bash
git status
```

Commit changes:

```bash
git add .
git commit -m "describe your change"
git push origin main
```

## Notes for Contributors

- Never commit `config.env`.
- Never commit Atlas usernames, passwords, or connection strings.
- Run `npm install` after cloning the repository.
- Use a separate Git branch when working on a new feature.
