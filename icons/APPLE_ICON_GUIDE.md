# Apple Touch Icon Creation Guide

## Problem
The current Apple touch icons have white backgrounds, making the logo invisible on iOS devices which often display icons against light backgrounds.

## Solution
Create Apple touch icons with dark grey backgrounds (#374151) to ensure proper visibility.

## Required Apple Touch Icons with Dark Grey Backgrounds

### File Requirements
- **apple-touch-icon.png** - 180×180px (default iOS)
- **apple-touch-icon-152x152.png** - 152×152px (iPad)  
- **apple-touch-icon-120x120.png** - 120×120px (iPhone)

### Design Specifications
- **Background Color**: #374151 (dark grey)
- **Logo**: White or light colored RADIUS logo centered
- **Padding**: 20-30px from edges for safe area
- **Format**: PNG, no transparency (solid background required)

## Quick Creation Steps

1. **Start with your logo** (preferably white/light version)
2. **Create canvas** at required size (180×180, 152×152, or 120×120)
3. **Fill background** with #374151 (dark grey)
4. **Center logo** with appropriate padding
5. **Save as PNG** (no transparency)

## Design Tools
- **Canva**: Use "Custom size" and set background color
- **Figma**: Create frame, add background fill, center logo
- **Photoshop**: New document, bucket fill background, add logo
- **Online Generators**: 
  - [RealFaviconGenerator](https://realfavicongenerator.net/)
  - [Favicon.io](https://favicon.io/)

## Testing
After creating icons, test on actual iOS devices or simulators to ensure proper visibility.

## Current Status
✅ HTML updated to reference proper Apple touch icon files
❌ Need to create actual icon files with dark grey backgrounds
