# FitMood - Mood Tracking App 🌈

A beautiful, feature-rich Progressive Web App (PWA) for tracking your daily moods and emotions. Built with React, Vite, and Tailwind CSS.

## ✨ Features

### 🎨 **Modern UI/UX**
- Beautiful gradient designs with smooth animations
- **Dark Mode** - Toggle between light and dark themes
- Responsive design that works on all devices
- Intuitive navigation with bottom tab bar

### 📊 **Advanced Analytics**
- **Interactive Charts** - Line charts, bar charts, and pie charts
- Mood trends over time (7 days, 30 days)
- Weekly mood patterns
- Mood distribution visualization
- Average mood calculations
- Common triggers tracking

### 😊 **Custom Mood Emojis**
- Choose your own emojis for each mood level
- Multiple preset themes (default, colorful, nature, animals, faces)
- Save custom emoji sets per user

### 💡 **Mood-Based Recommendations**
- Personalized activity suggestions based on your current mood
- Tips and guidance for improving your emotional well-being
- Context-aware recommendations

### 📱 **Offline Mode**
- Full functionality when offline
- Automatic data sync when connection is restored
- IndexedDB for local storage
- Queue system for pending API calls

### 🔔 **Push Notifications**
- Daily mood check-in reminders
- Customizable reminder times
- Browser notification support
- Service Worker integration

### 🏠 **Enhanced Home Page**
- Daily streak tracking
- Quick mood logging
- Recent mood history
- Personalized recommendations
- Beautiful stat cards

### 🤖 **AI Chat Assistant**
- Supportive conversation interface
- Mood-aware responses
- Helpful tips and guidance

### 👤 **User Management**
- User authentication (login/register)
- Profile management
- Admin dashboard (for admin users)
- Statistics tracking

## 🚀 Installation & Setup

### Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- A Google Apps Script Web App URL (for backend API)

### Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd fitmood-app
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure API URL

Open `src/App.jsx` and update the `API_URL` constant with your Google Apps Script Web App URL:

```javascript
const API_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
```

### Step 4: Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Step 5: Build for Production

```bash
npm run build
```

The production build will be in the `dist` folder.

### Step 6: Preview Production Build

```bash
npm run preview
```

## 📦 Project Structure

```
fitmood-app/
├── src/
│   ├── App.jsx              # Main application component
│   ├── main.jsx             # Entry point
│   ├── index.css            # Global styles
│   └── utils/
│       ├── offlineStorage.js      # IndexedDB offline storage
│       ├── notifications.js       # Push notifications
│       ├── moodRecommendations.js # Mood-based recommendations
│       └── customEmojis.js        # Custom emoji management
├── public/                   # Static assets
├── dist/                     # Production build output
├── index.html               # HTML template
├── vite.config.js           # Vite configuration
├── tailwind.config.js       # Tailwind CSS configuration
└── package.json             # Dependencies and scripts
```

## 🎯 Key Features Implementation

### Dark Mode
- Toggle available in navigation bar
- Persists user preference in localStorage
- Respects system preference on first load
- Smooth transitions between themes

### Offline Mode
- Uses IndexedDB for local storage
- Automatically queues API calls when offline
- Syncs data when connection is restored
- Visual indicator shows online/offline status

### Custom Emojis
- Accessible from mood entry form
- Multiple preset themes available
- Saves preferences per user
- Easy emoji picker interface

### Push Notifications
- Request permission on first use
- Configurable reminder times
- Daily check-in notifications
- Works with service workers

### Enhanced Charts
- Recharts library for visualizations
- Area charts for mood trends
- Bar charts for weekly patterns
- Pie charts for mood distribution
- Dark mode compatible

## 🔧 Configuration

### Environment Variables

No environment variables required. All configuration is in `src/App.jsx`.

### PWA Configuration

PWA settings are configured in `vite.config.js`:
- Service worker registration
- Manifest file
- Offline caching strategies

### Tailwind CSS

Dark mode is enabled via class-based strategy in `tailwind.config.js`.

## 📱 Progressive Web App (PWA)

The app is configured as a PWA:
- Installable on mobile and desktop
- Works offline
- Service worker for caching
- App manifest for installation

### Installing as PWA

1. Open the app in a supported browser (Chrome, Edge, Safari)
2. Look for the install prompt or use browser menu
3. Click "Install" to add to home screen/desktop

## 🛠️ Technologies Used

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Recharts** - Chart library
- **Lucide React** - Icon library
- **IndexedDB** - Client-side database
- **Service Workers** - Offline support and caching
- **PWA Plugin** - Progressive Web App features

## 📝 API Integration

The app requires a Google Apps Script backend. The API should support:

- `login` - User authentication
- `register` - User registration
- `getUserMoods` - Fetch user mood history
- `getUserStats` - Get user statistics
- `addMood` - Save new mood entry
- `getAllUsers` - Admin: Get all users (admin only)
- `getUserDetails` - Admin: Get user details (admin only)

## 🎨 Customization

### Changing Colors

Edit `tailwind.config.js` to customize the color scheme:

```javascript
colors: {
  primary: '#6366f1',    // Indigo
  secondary: '#8b5cf6',   // Purple
}
```

### Adding New Features

1. Create utility functions in `src/utils/`
2. Import and use in `src/App.jsx`
3. Update components as needed

## 🐛 Troubleshooting

### Offline Mode Not Working
- Ensure IndexedDB is supported in your browser
- Check browser console for errors
- Verify service worker is registered

### Notifications Not Showing
- Check browser notification permissions
- Ensure HTTPS (required for notifications)
- Verify service worker is active

### Dark Mode Not Applying
- Check `tailwind.config.js` has `darkMode: 'class'`
- Verify `dark` class is added to `<html>` element
- Clear browser cache if needed

### Build Errors
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- Check Node.js version (v16+)

## 📄 License

This project is private and proprietary.

## 👨‍💻 Developer

**Developed by AALEKH KUMAR**  
**Powered by SAHA**

## 🔮 Future Enhancements

See [FUTURE_ENHANCEMENTS.md](./FUTURE_ENHANCEMENTS.md) for planned features and improvements.

## 📞 Support

For issues or questions, please contact the development team.

---

**Made with ❤️ for better mental health tracking**
"# FitMoodApp" 
"# Moodly__" 
"# Moodly__" 
