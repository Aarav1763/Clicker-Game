Clicker Game + Clans (Demo)

How to use:
1. Create a Firebase project, enable Firestore and Anonymous Authentication.
2. Replace FIREBASE_CONFIG in firebase.js with your project's config.
3. (Optional) Deploy cloud_function.js as a Firebase Function for daily boss resets.
4. Host index.html somewhere (GitHub Pages / Netlify). The app will connect to Firestore.

Notes:
- This demo uses client-side transactions and is not fully cheat-proof. For production, move reward finalization to secure server-side code.
- The UI is minimal; feel free to customize graphics and styling.
