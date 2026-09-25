// Private customer transcripts and reviewed expected output stay outside git.
// This validates an independently reviewed checklist; it does NOT run inference.
import {validateResult} from '../../supabase/functions/meeting-import/contract.ts'
const [transcriptPath,expectedPath]=Deno.args
if(!transcriptPath||!expectedPath)throw new Error('Usage: deno run --allow-read scripts/tests/meeting-transcript-eval.mts <transcript.txt> <reviewed-expected.json>')
const transcript=await Deno.readTextFile(transcriptPath)
const expected=JSON.parse(await Deno.readTextFile(expectedPath))
const result=validateResult(expected,transcript,[])
if(result.tasks.some(t=>t.ownerParticipantId||t.assignmentConfidence!=='uncertain'))throw new Error('Unbound participants must not auto-assign')
if(transcript.length>40000)throw new Error('Input exceeds product limit')
console.log(JSON.stringify({characters:transcript.length,tasks:result.tasks.length,verbatimSourcesValid:true,automaticAssignments:0,mode:'reviewed-fixture-validation-not-live-inference'}))
