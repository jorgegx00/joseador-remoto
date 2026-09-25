export type {
  AtsReport,
  AtsCheckResult,
  AtsIssue,
  AtsSeverity,
  AtsCheckName,
  KeywordMatch,
  NarrativeScores,
} from "@/types/ats";

export interface CheckerResult {
  score: number;
  issues: import("@/types/ats").AtsIssue[];
  details: Record<string, unknown>;
}

export interface KeywordExtractionResult {
  keyword: string;
  frequency: number;
  importance: number;
}

// English stop words (articles, prepositions, conjunctions, pronouns, common verbs)
export const ENGLISH_STOP_WORDS = [
  "a","about","above","after","again","against","all","am","an","and","any","are",
  "aren't","as","at","be","because","been","before","being","below","between","both",
  "but","by","can","can't","cannot","could","couldn't","did","didn't","do","does",
  "doesn't","doing","don't","down","during","each","few","for","from","further","get",
  "got","had","hadn't","has","hasn't","have","haven't","having","he","he'd","he'll",
  "he's","her","here","here's","hers","herself","him","himself","his","how","how's",
  "i","i'd","i'll","i'm","i've","if","in","into","is","isn't","it","it's","its",
  "itself","just","let","let's","may","me","might","more","most","mustn't","my",
  "myself","no","nor","not","of","off","on","once","only","or","other","ought","our",
  "ours","ourselves","out","over","own","per","same","shall","shan't","she","she'd",
  "she'll","she's","should","shouldn't","so","some","such","than","that","that's",
  "the","their","theirs","them","themselves","then","there","there's","these","they",
  "they'd","they'll","they're","they've","this","those","through","to","too","under",
  "until","up","upon","us","very","via","was","wasn't","we","we'd","we'll","we're",
  "we've","were","weren't","what","what's","when","when's","where","where's","which",
  "while","who","who's","whom","why","why's","will","with","won't","would","wouldn't",
  "you","you'd","you'll","you're","you've","your","yours","yourself","yourselves",
  "also","still","well","even","now","new","old","one","two","three","much","many",
  "make","like","just","know","take","come","see","look","want","give","use","find",
  "tell","ask","work","seem","feel","try","leave","call",
];

// Spanish stop words
export const SPANISH_STOP_WORDS = [
  "a","al","algo","algunas","algunos","ante","antes","como","con","contra","cual",
  "cuando","de","del","desde","donde","durante","e","el","ella","ellas","ellos","en",
  "entre","era","esa","esas","ese","eso","esos","esta","estaba","estado","estar",
  "estas","este","esto","estos","fue","fueron","ha","había","han","has","hasta","hay",
  "la","las","le","les","lo","los","más","me","mi","mí","mientras","muy","nada",
  "ni","no","nos","nosotros","nuestro","nuestra","nuestros","nuestras","o","otra",
  "otras","otro","otros","para","pero","por","porque","que","qué","se","ser","si",
  "sí","sin","sino","sobre","somos","son","soy","su","sus","también","te","tengo",
  "ti","tiene","tienen","toda","todas","todo","todos","tu","tú","tus","un","una",
  "uno","unos","unas","usted","ustedes","va","vamos","varias","varios","y","ya","yo",
];

export const STOP_WORDS: Set<string> = new Set([
  ...ENGLISH_STOP_WORDS,
  ...SPANISH_STOP_WORDS,
]);
