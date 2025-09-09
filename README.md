# MIDI Falling-Bar Visualizer

This is a web-based MIDI visualizer that displays MIDI notes as "falling bars" in a 3D piano roll format, inspired by modern player pianos and synthesia-style videos. It uses `Three.js` for WebGL rendering and `@tonejs/midi` for MIDI file parsing.

## Features

- **3D Visualization**: Notes are rendered as falling bars on a 3D piano keyboard.
- **Instrument Support**: Different MIDI channels are assigned different colors and can be mapped to various synthesized instruments.
- **Playback Control**: Play, pause, and seek through the MIDI file.
- **Playback Speed Control**: Adjust playback speed from 0.5x to 2.0x.
- **Customizable Camera**: Switch between a perspective view and a top-down view.
- **Performance Modes**: Choose between different rendering quality modes to optimize for your hardware.
- **Drag and Drop**: Simply drop a MIDI file onto the page to start.
- **Picture-in-Picture (PiP)**: Watch the visualization in a floating window while you do other things.

## How to Use

1. **Open the Visualizer**: Access the visualizer through the deployed link (or open `dist/index.html` if running locally).
2. **Load a MIDI File**:
   - Click the "Choose File" button to select a `.mid` or `.midi` file from your computer.
   - Or, drag and drop a MIDI file anywhere onto the page.
3. **Control Playback**:
   - Use the **Play/Pause** button to start and stop the music.
   - Click on the **progress bar** to seek to a specific point in the song.
   - Use the **Arrow Left/Right** keys to skip backward or forward by 10 seconds.
   - Adjust the **Speed** dropdown to change the playback speed.
4. **Customize Your View**:
   - **Channel Instruments**: Expand this section to assign different synthesizer sounds to each MIDI channel and adjust their volume.
   - **Top-Down View**: Toggle the checkbox for an overhead view of the piano.
   - **Zoom**: Use your mouse wheel, trackpad, or the `-` and `+` keys to zoom in and out.
   - **Performance Mode**: If you experience lag, try switching to a "Lightweight" mode.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (Version specified in `package.json`'s `volta` field)
- [npm](https://www.npmjs.com/)

### Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/hi2ma-bu4/MIDI-FallingBar.git
    ```
2.  Navigate to the project directory:
    ```bash
    cd MIDI-FallingBar
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```

### Running the Development Server

To start a local development server with hot-reloading:

```bash
npm start
```

This will open the visualizer in your default web browser at `http://localhost:8080`.

### Building for Production

To create an optimized production build:

```bash
npm run build
```

The bundled files will be placed in the `dist/` directory. You can then deploy this directory to any static web host.
