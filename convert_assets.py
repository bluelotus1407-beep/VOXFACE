import os
import glob
import json
from PIL import Image, ImageEnhance

def img_to_ascii(img_path, width=64, height=28):
    img = Image.open(img_path)
    
    # Convert to grayscale
    gray = img.convert('L')
    
    # Crop to the active area (bounding box of non-black pixels)
    bbox = gray.getbbox()
    if bbox:
        pad = 20
        bbox_padded = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(img.width, bbox[2] + pad),
            min(img.height, bbox[3] + pad)
        )
        img = img.crop(bbox_padded)
    
    # Enhance contrast
    img = img.convert('L')
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.5)
    
    # Resize to exact target grid dimensions
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    
    # Character mapping for retro monochrome green screen
    chars = " .:-=+*#%@"
    num_chars = len(chars)
    
    ascii_rows = []
    for y in range(height):
        row = []
        for x in range(width):
            val = img.getpixel((x, y))
            idx = int(val / 256.0 * num_chars)
            idx = max(0, min(idx, num_chars - 1))
            row.append(chars[idx])
        ascii_rows.append("".join(row))
    return ascii_rows

def main():
    assets_dir = 'assets'
    out_dir = 'src/assets/face-frames'
    os.makedirs(out_dir, exist_ok=True)
    
    png_files = glob.glob(os.path.join(assets_dir, '*.png'))
    
    for file_path in png_files:
        filename = os.path.basename(file_path)
        # Skip crt background and layout samples
        if filename in ['crt.png', 'sample2.png']:
            continue
            
        frame_name = os.path.splitext(filename)[0]
        print(f"Converting {filename} to ASCII art...")
        
        try:
            ascii_art = img_to_ascii(file_path, width=64, height=28)
            
            # Save as JSON list of strings
            out_path = os.path.join(out_dir, f"{frame_name}.json")
            with open(out_path, 'w') as f:
                json.dump(ascii_art, f, indent=2)
                
            print(f"Saved to {out_path}")
        except Exception as e:
            print(f"Failed to convert {filename}: {e}")

if __name__ == '__main__':
    main()
