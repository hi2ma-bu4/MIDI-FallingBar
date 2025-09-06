export const midiInstrumentMap: { [key: string]: string } = {
	// Piano
	"acoustic grand piano": "piano",
	"bright acoustic piano": "piano",
	"electric grand piano": "piano",
	"honky-tonk piano": "piano",
	"electric piano 1": "piano",
	"electric piano 2": "piano",
	harpsichord: "harmonium", // similar
	clavinet: "piano",

	// Chromatic Percussion
	celesta: "xylophone", // similar
	glockenspiel: "xylophone", // similar
	"music box": "xylophone", // similar
	vibraphone: "xylophone", // similar
	marimba: "xylophone", // similar
	xylophone: "xylophone",
	"tubular bells": "xylophone", // similar
	dulcimer: "guitar-acoustic", // similar

	// Organ
	"drawbar organ": "organ",
	"percussive organ": "organ",
	"rock organ": "organ",
	"church organ": "organ",
	"reed organ": "harmonium",
	accordion: "harmonium", // similar
	harmonica: "harmonium", // similar
	"tango accordion": "harmonium", // similar

	// Guitar
	"acoustic guitar (nylon)": "guitar-nylon",
	"acoustic guitar (steel)": "guitar-acoustic",
	"electric guitar (jazz)": "guitar-electric",
	"electric guitar (clean)": "guitar-electric",
	"electric guitar (muted)": "guitar-electric",
	"overdriven guitar": "guitar-electric",
	"distortion guitar": "guitar-electric",
	"guitar harmonics": "guitar-electric",

	// Bass
	"acoustic bass": "bass-electric", // similar
	"electric bass (finger)": "bass-electric",
	"electric bass (pick)": "bass-electric",
	"fretless bass": "bass-electric",
	"slap bass 1": "bass-electric",
	"slap bass 2": "bass-electric",
	"synth bass 1": "bass-electric", // similar
	"synth bass 2": "bass-electric", // similar

	// Strings
	violin: "violin",
	viola: "violin", // similar
	cello: "cello",
	contrabass: "contrabass",
	"tremolo strings": "violin", // similar
	"pizzicato strings": "violin", // similar
	"orchestral harp": "harp",
	timpani: "bassoon", // no good match, using a low instrument

	// Ensemble
	"string ensemble 1": "violin", // similar
	"string ensemble 2": "violin", // similar
	"synthstrings 1": "violin", // similar
	"synthstrings 2": "violin", // similar
	"choir aahs": "sawtooth", // synth voice
	"voice oohs": "sine", // synth voice
	"synth voice": "sawtooth",
	"orchestra hit": "trumpet", // brassy hit

	// Brass
	trumpet: "trumpet",
	trombone: "trombone",
	tuba: "tuba",
	"muted trumpet": "trumpet",
	"french horn": "french-horn",
	"brass section": "trumpet", // similar
	"synthbrass 1": "trumpet", // similar
	"synthbrass 2": "trumpet", // similar

	// Reed
	"soprano sax": "saxophone",
	"alto sax": "saxophone",
	"tenor sax": "saxophone",
	"baritone sax": "saxophone",
	oboe: "clarinet", // similar
	"english horn": "french-horn", // similar
	bassoon: "bassoon",
	clarinet: "clarinet",

	// Pipe
	piccolo: "flute",
	flute: "flute",
	recorder: "flute",
	"pan flute": "flute",
	"blown bottle": "flute",
	shakuhachi: "flute",
	whistle: "flute",
	ocarina: "flute",

	// Synth Lead
	"lead 1 (square)": "square",
	"lead 2 (sawtooth)": "sawtooth",
	"lead 3 (calliope)": "triangle",
	"lead 4 (chiff)": "triangle",
	"lead 5 (charang)": "triangle",
	"lead 6 (voice)": "sine",
	"lead 7 (fifths)": "sawtooth",
	"lead 8 (bass + lead)": "sawtooth",

	// Synth Pad
	"pad 1 (new age)": "sawtooth",
	"pad 2 (warm)": "sawtooth",
	"pad 3 (polysynth)": "sawtooth",
	"pad 4 (choir)": "sawtooth",
	"pad 5 (bowed)": "sawtooth",
	"pad 6 (metallic)": "sawtooth",
	"pad 7 (halo)": "sawtooth",
	"pad 8 (sweep)": "sawtooth",

	// Synth Effects
	"fx 1 (rain)": "sine",
	"fx 2 (soundtrack)": "sine",
	"fx 3 (crystal)": "sine",
	"fx 4 (atmosphere)": "sine",
	"fx 5 (brightness)": "sine",
	"fx 6 (goblins)": "sine",
	"fx 7 (echoes)": "sine",
	"fx 8 (sci-fi)": "sine",

	// Ethnic
	sitar: "guitar-nylon", // similar
	banjo: "guitar-acoustic", // similar
	shamisen: "guitar-nylon", // similar
	koto: "harp", // similar
	kalimba: "xylophone", // similar
	"bag pipe": "french-horn", // similar
	fiddle: "violin",
	shanai: "clarinet", // similar

	// Percussive
	"tinkle bell": "xylophone",
	agogo: "xylophone",
	"steel drums": "xylophone",
	woodblock: "xylophone",
	"taiko drum": "bassoon",
	"melodic tom": "bassoon",
	"synth drum": "square",

	// Sound Effects
	"guitar fret noise": "guitar-acoustic",
	"breath noise": "flute",
	seashore: "sine",
	"bird tweet": "flute",
	"telephone ring": "square",
	helicopter: "sawtooth",
	applause: "sine",
	gunshot: "bassoon",
};
