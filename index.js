const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;
const session = require('express-session');
const multer = require('multer');
const stream = require('stream');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const port = 3000;

// Middleware
app.use(express.static('public/app.html'));
app.use(express.json());
app.use(session({
  secret: 'your_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using https
}));

const upload = multer({ storage: multer.memoryStorage() });

// Constants
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];
const CREDENTIALS_PATH = path.join(process.cwd(), 'client_secret_802555625096-gqr8ucbt7aggia7vgl4hds4k4nsljill.apps.googleusercontent.com.json');
const APP_FOLDER_NAME = 'SaveMax15 Files';

// Helper Functions
async function loadCredentials() {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH);
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading credentials:', error);
    throw new Error('Failed to load credentials');
  }
}

async function createOAuth2Client() {
  const credentials = await loadCredentials();
  const { client_secret, client_id } = credentials.web;
  return new google.auth.OAuth2(
    client_id,
    client_secret,
    'https://savemax15.onrender.com/oauth2callback'
  );
}

async function getOrCreateAppFolder(drive) {
  try {
    const response = await drive.files.list({
      q: `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (response.data.files.length > 0) {
      return response.data.files[0].id;
    } else {
      const fileMetadata = {
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      };
      const file = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
      });
      return file.data.id;
    }
  } catch (error) {
    console.error('Error getting or creating app folder:', error);
    throw error;
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/auth/google', async (req, res) => {
  const oauth2Client = await createOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
  const oauth2Client = await createOAuth2Client();
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    req.session.tokens = tokens;

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    req.session.user = {
      userId: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture
    };

    res.redirect('/');
  } catch (error) {
    console.error('Error getting OAuth2 tokens:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
  }
});

app.get('/user', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.session.user || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const oauth2Client = await createOAuth2Client();
    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const folderId = await getOrCreateAppFolder(drive);
    
    const fileMetadata = {
      name: req.file.originalname,
      parents: [folderId]
    };
    const media = {
      mimeType: req.file.mimetype,
      body: stream.Readable.from(req.file.buffer),
    };
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });
    res.json({ id: file.data.id });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.get('/list-files', async (req, res) => {
  if (!req.session.user || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const oauth2Client = await createOAuth2Client();
    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const folderId = await getOrCreateAppFolder(drive);
    
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      pageSize: 30,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
    });
    res.json(response.data.files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

app.delete('/delete/:fileId', async (req, res) => {
  if (!req.session.user || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const oauth2Client = await createOAuth2Client();
    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    await drive.files.delete({
      fileId: req.params.fileId,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.put('/update/:fileId', async (req, res) => {
  if (!req.session.user || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const oauth2Client = await createOAuth2Client();
    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    await drive.files.update({
      fileId: req.params.fileId,
      resource: { name: req.body.newName },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating file name:', error);
    res.status(500).json({ error: 'Failed to update file name' });
  }
});

app.get('/download/:fileId', async (req, res) => {
  if (!req.session.user || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const oauth2Client = await createOAuth2Client();
    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const file = await drive.files.get({
      fileId: req.params.fileId,
      alt: 'media'
    }, { responseType: 'stream' });
    
    res.setHeader('Content-disposition', `attachment; filename=${file.data.name}`);
    res.setHeader('Content-type', file.data.mimeType);

    file.data.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
