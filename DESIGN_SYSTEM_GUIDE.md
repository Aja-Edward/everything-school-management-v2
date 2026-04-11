# Tenant-Specific Design System - Implementation Guide

## Overview
Every tenant (school) on the platform can now customize their own unique design, including colors, themes, typography, and UI preferences. These settings are automatically applied when users log in with their tenant's slug.

---

## Architecture

### Backend Implementation

#### 1. **Database Model** (`backend/tenants/models.py`)
Extended `TenantSettings` with comprehensive design fields:

```python
class TenantSettings(models.Model):
    # Design & Branding
    primary_color = CharField(max_length=7, default='#4F46E5')
    secondary_color = CharField(max_length=7, default='#10B981')
    theme = CharField(max_length=50, choices=[...multiple options...])
    typography = CharField(max_length=50, choices=[...multiple fonts...])
    border_radius = CharField(max_length=50, choices=[...radius options...])
    shadow_style = CharField(max_length=50, choices=[...shadow options...])
    animations_enabled = BooleanField(default=True)
    compact_mode = BooleanField(default=False)
    dark_mode = BooleanField(default=False)
    high_contrast = BooleanField(default=False)
```

#### 2. **Serializer** (`backend/tenants/serializers.py`)
`TenantSettingsSerializer` includes all design fields for API serialization.

#### 3. **API Endpoint** (`backend/tenants/views.py`)
`TenantSettingsViewSet.current()` - Handles both GET and PATCH requests:
- **GET** `/api/tenants/settings/current/` - Retrieves current tenant's design settings
- **PATCH** `/api/tenants/settings/current/` - Updates current tenant's design settings

---

### Frontend Implementation

#### 1. **Design Settings Service** (`frontend/src/services/DesignSettingsService.ts`)
Manages all design operations with:
- `getDesignSettings()` - Fetch current tenant's design settings from API
- `updateDesignSettings(newSettings)` - Save design changes to API
- `applyDesignSettings(settings)` - Apply settings to DOM/CSS variables
- `clearCache()` - Clear cached settings
- Built-in **5-minute caching** to reduce API calls

#### 2. **Design Tab Component** (`frontend/src/components/dashboards/admin/settingtab/components/tabs/DesignTab.tsx`)
**Key Features:**
- ✅ Loads design settings on mount
- ✅ Real-time preview of color changes
- ✅ Theme selection with visual previews
- ✅ Typography, border radius, and shadow customization
- ✅ Display preferences (animations, dark mode, high contrast)
- ✅ Unsaved changes indicator
- ✅ Reset to default button
- ✅ Automatic API persistence

---

## How It Works

### 1. **Tenant Customization Flow**
```
School Admin clicks "Design" Tab
    ↓
Design settings loaded from API (per tenant)
    ↓
Admin customizes colors, theme, typography, etc.
    ↓
Admin clicks "Save Changes"
    ↓
Settings saved to TenantSettings model (API)
    ↓
  Design Service applies settings to DOM
```

### 2. **Design Application Flow**
```
User logs in with school slug (e.g., school-abc)
    ↓
App initialization loads design settings from API
    ↓
DesignSettingsService.applyDesignSettings(settings)
    ↓
CSS variables updated for the tenant
    ↓
All components reflect tenant's design system
```

### 3. **CSS Variables Applied**
The service applies the following CSS variables to the document root:

```css
--primary-color: #4F46E5;
--secondary-color: #10B981;
--primary-gradient: linear-gradient(135deg, #4F46E5 0%, ...);
--primary-shadow: 0 10px 15px -3px #4F46E530;
--font-family: 'Inter', system-ui, ...;
--border-radius: rounded-lg;
--shadow-style: shadow-md;
```

Also applies class names to `<body>`:
- `theme-{theme-id}` - Current theme
- `font-{font-name}` - Current typography
- `animations-enabled` / `animations-disabled`
- `compact-mode` (if enabled)
- `dark` (if dark mode enabled)
- `high-contrast` (if enabled)

---

## Available Design Options

### Themes (14 options)
- Default (Recommended)
- Modern
- Classic
- Vibrant
- Minimal
- Corporate
- Premium
- Dark Mode
- Obsidian (Ultra Premium)
- Aurora (Ultra Premium)
- Midnight (Ultra Premium)
- Crimson (Ultra Premium)
- Forest (Ultra Premium)
- Golden (Ultra Premium)

### Typography (5 options)
- Inter (Recommended)
- Roboto
- Open Sans
- Poppins
- Montserrat

### Customization
- **Primary Color** - Hex color picker + text input
- **Secondary Color** - Hex color picker + text input
- **Border Radius** - Sharp → Very Rounded (5 levels)
- **Shadow Style** - None → Extra Large (5 levels)
- **Animations** - Toggle on/off
- **Compact Mode** - Toggle for dense UI
- **Dark Mode** - Toggle for dark theme
- **High Contrast** - Toggle for accessibility

---

## API Usage

### Get Design Settings
```bash
GET /api/tenants/settings/current/
Authorization: Bearer {token}
```

**Response:**
```json
{
  "primary_color": "#4F46E5",
  "secondary_color": "#10B981",
  "theme": "default",
  "typography": "Inter",
  "border_radius": "rounded-lg",
  "shadow_style": "shadow-md",
  "animations_enabled": true,
  "compact_mode": false,
  "dark_mode": false,
  "high_contrast": false,
  ... other tenant settings
}
```

### Update Design Settings
```bash
PATCH /api/tenants/settings/current/
Authorization: Bearer {token}
Content-Type: application/json

{
  "primary_color": "#FF6B6B",
  "theme": "modern",
  "animations_enabled": false
}
```

---

## Implementation in Other Components

To use the design system in other components:

### 1. **In App Initialization**
```typescript
// main.tsx or app initialization
import DesignSettingsService from '@/services/DesignSettingsService';

// Load and apply design settings on app start
const designSettings = await DesignSettingsService.getDesignSettings();
DesignSettingsService.applyDesignSettings(designSettings);
```

### 2. **Listen to Design Changes**
```typescript
// In any component
useEffect(() => {
  const handleDesignChange = (event: Event) => {
    const customEvent = event as CustomEvent;
    console.log('Design changed:', customEvent.detail);
    // Re-render component with new design
  };

  window.addEventListener('designSettingsApplied', handleDesignChange);
  return () => {
    window.removeEventListener('designSettingsApplied', handleDesignChange);
  };
}, []);
```

### 3. **Use CSS Variables**
```css
.button {
  background-color: var(--primary-color);
  box-shadow: var(--primary-shadow);
  border-radius: var(--border-radius);
  font-family: var(--font-family);
}
```

---

## Caching Strategy

The DesignSettingsService implements a 5-minute cache:
- Reduces redundant API calls
- Improves performance on repeated page loads
- Cache automatically invalidates on save
- Manual cache clearing available via `clearCache()`

---

## Database Migration

To apply the new design fields to existing installations:

```bash
# Backend
cd backend
python manage.py makemigrations tenants
python manage.py migrate tenants
```

---

## Multi-Tenant Benefits

✅ **Complete Isolation** - Each tenant has independent design settings  
✅ **White Labeling** - Schools can fully rebrand the platform  
✅ **User Experience** - Consistent branding throughout the app  
✅ **Accessibility** - High contrast and animation options  
✅ **Performance** - CSS variables + caching for fast rendering  
✅ **Scalability** - Supports unlimited tenants with unique designs  

---

## Testing

### Test Design Changes Locally
1. Go to Admin Dashboard → Settings → Design Tab
2. Select a theme and change the primary color
3. Click "Save Changes"
4. Verify the entire UI updates with new colors
5. Refresh the page - settings should persist

### Test Tenant Isolation
1. Log in with School A - verify their design
2. Log in with School B - verify different design
3. Each tenant should see only their own customizations

---

## Future Enhancements

- 🔲 Design templates/presets
- 🔲 Custom font uploads
- 🔲 Logo/favicon management (already in TenantSettings)
- 🔲 CSS override capabilities
- 🔲 Design history/rollback
- 🔲 A/B testing for design variants

---

## Troubleshooting

### Design settings not loading
- Check browser console for errors
- Verify API endpoint is accessible
- Check authentication token is valid

### Changes not persisting
- Ensure authenticated with correct tenant
- Check network requests in browser DevTools
- Verify backend validation errors

### CSS variables not applying
- Check browser DevTools - Element styles
- Verify DesignSettingsService.applyDesignSettings() is called
- Check for CSS specificity conflicts

---

## Summary

The tenant-specific design system is now **fully implemented** and ready to use. Each school can:
- Choose from 14 pre-built themes
- Customize colors, typography, and UI elements
- Control animations and accessibility features
- Have settings automatically applied to all users in their tenant

All design choices are automatically persisted and scoped to each individual tenant!
