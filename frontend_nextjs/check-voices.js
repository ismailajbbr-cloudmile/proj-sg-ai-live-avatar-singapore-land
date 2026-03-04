const textToSpeech = require('@google-cloud/text-to-speech');

const credJson = process.env.GOOGLE_CREDENTIALS_JSON;
let client;
if (credJson) {
    const credentials = JSON.parse(credJson);
    client = new textToSpeech.TextToSpeechClient({ credentials });
} else {
    client = new textToSpeech.TextToSpeechClient();
}

async function listVoices() {
    const [result] = await client.listVoices({});
    const voices = result.voices;

    console.log("Looking for en-SG voices...");
    const sgVoices = voices.filter(v => v.languageCodes.includes("en-SG"));

    if (sgVoices.length === 0) {
        console.log("No en-SG voices found.");
    } else {
        sgVoices.forEach(voice => {
            console.log(`Name: ${voice.name}`);
            console.log(`  SSML Gender: ${voice.ssmlGender}`);
            console.log(`  Natural Sample Rate: ${voice.naturalSampleRateHertz}`);
        });
    }
}

listVoices().catch(console.error);
