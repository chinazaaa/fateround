/** Built-in Would You Rather prompts — 100 questions */

import { pickLeastUsed } from '@/lib/question-picker'

export interface WyrQuestion {
  optionA: string
  optionB: string
}

export const WYR_QUESTIONS: WyrQuestion[] = [
  {
    optionA: 'never have an orgasm again',
    optionB: 'orgasm every hour on the hour',
  },
  {
    optionA: 'only have sex in bed for the rest of your life,',
    optionB: 'never be able to have sex in bed again',
  },
  {
    optionA: 'publish your porn search history',
    optionB: 'read all your text messages aloud to your hometown',
  },
  {
    optionA: 'have a one-night stand',
    optionB: 'a bubble bath with a stranger',
  },
  {
    optionA: 'have sex with someone you hate but the sex is amazing,',
    optionB: 'have sex with someone you love but the sex is terrible',
  },
  {
    optionA: 'always have sex with the lights on,',
    optionB: 'in a pitch-black room',
  },
  {
    optionA: 'never have a good meal again,',
    optionB: 'never have good sex again',
  },
  {
    optionA: 'never have foreplay again',
    optionB: 'only have foreplay and no penetrative sex of any kind for the rest of your life',
  },
  {
    optionA: 'cry every time you climax,',
    optionB: 'have an orgasm every time you cry',
  },
  {
    optionA: 'have a threesome with someone you know',
    optionB: 'with complete strangers',
  },
  {
    optionA: 'have sex with a co-worker',
    optionB: 'with a high school friend',
  },
  {
    optionA: 'be blindfolded',
    optionB: 'blindfold me',
  },
  {
    optionA: 'only have kinky sex',
    optionB: 'romantic sex',
  },
  {
    optionA: 'have morning sex',
    optionB: 'late-night sex',
  },
  {
    optionA: 'give up oral sex',
    optionB: 'anal sex',
  },
  {
    optionA: 'be dominant',
    optionB: 'submissive in the bedroom',
  },
  {
    optionA: 'have sex in the bathroom',
    optionB: 'the kitchen',
  },
  {
    optionA: 'go on top for the rest of your life,',
    optionB: 'on the bottom',
  },
  {
    optionA: 'be a bad kisser',
    optionB: 'bad at giving oral sex',
  },
  {
    optionA: 'only give',
    optionB: 'only receive',
  },
  {
    optionA: 'be tied up',
    optionB: 'blindfolded',
  },
  {
    optionA: 'have sex in a secluded forest',
    optionB: 'on a secluded beach',
  },
  {
    optionA: 'use whipped cream',
    optionB: 'chocolate syrup during foreplay',
  },
  {
    optionA: 'have a spontaneous quickie in a place where we might get caught,',
    optionB: 'plan an intimate night at home',
  },
  {
    optionA: 'incorporate food into our sex life',
    optionB: 'keep food strictly for dining',
  },
  {
    optionA: 'have passionate sex after a fight',
    optionB: 'make love softly to resolve a conflict',
  },
  {
    optionA: 'talk dirty to me over text all day',
    optionB: "save it all for when we're together",
  },
  {
    optionA: 'wear provocative lingerie',
    optionB: 'nothing at all under your clothes for a date night',
  },
  {
    optionA: 'get a sensual massage with oil',
    optionB: 'a stimulating massage with a feather',
  },
  {
    optionA: 'engage in a role-playing scenario where we are strangers',
    optionB: 'one where we are historical figures',
  },
  {
    optionA: 'incorporate music into our lovemaking',
    optionB: 'prefer the sounds of nature',
  },
  {
    optionA: 'have a steamy session in a hot tub',
    optionB: 'under a waterfall',
  },
  {
    optionA: 'have your hair pulled',
    optionB: 'your back scratched',
  },
  {
    optionA: 'end every date night with a sensual dance',
    optionB: 'a striptease',
  },
  {
    optionA: 'have sex while watching a steamy movie',
    optionB: 'while listening to seductive music',
  },
  {
    optionA: 'have a hushed quickie while guests are in the other room',
    optionB: 'wait until everyone leaves',
  },
  {
    optionA: 'have me speak in an accent during foreplay',
    optionB: 'stay completely silent but very expressive',
  },
  {
    optionA: 'shower together every day',
    optionB: 'only have bubble baths together on special occasions',
  },
  {
    optionA: 'explore new territories with body paint',
    optionB: 'with blindfolds and sensation play',
  },
  {
    optionA: 'make out in the rain',
    optionB: 'in the backseat of a car',
  },
  {
    optionA: 'have me tease you with a feather',
    optionB: 'with ice cubes',
  },
  {
    optionA: 'wake up to oral sex',
    optionB: 'to a full-body massage',
  },
  {
    optionA: 'skinny dip at midnight',
    optionB: 'sunbathe nude',
  },
  {
    optionA: 'playfully wrestle in bed',
    optionB: 'have a tickle fight',
  },
  {
    optionA: 'make love in front of a fireplace',
    optionB: 'by the light of hundreds of candles',
  },
  {
    optionA: 'receive a sexy voicemail',
    optionB: 'an explicit picture message',
  },
  {
    optionA: 'be gently dominated',
    optionB: 'gently dominate me',
  },
  {
    optionA: 'use body chocolate',
    optionB: 'edible underwear',
  },
  {
    optionA: 'explore Kamasutra together',
    optionB: "take a steamy couple's yoga class",
  },
  {
    optionA: 'have sex in a luxurious hotel room',
    optionB: 'in a cozy cabin in the woods',
  },
  {
    optionA: 'spend an entire day teasing each other without release',
    optionB: 'have immediate satisfaction',
  },
  {
    optionA: 'have your body worshiped',
    optionB: 'worship my body',
  },
  {
    optionA: 'explore light bondage',
    optionB: 'sensory deprivation',
  },
  {
    optionA: 'spend a day sexting',
    optionB: 'have an hour of uninterrupted phone sex',
  },
  {
    optionA: 'play naughty charades',
    optionB: 'have a sexy scavenger hunt',
  },
  {
    optionA: 'be serenaded with a love song before sex',
    optionB: 'be read erotic poetry after',
  },
  {
    optionA: 'have an exotic dancer teach us moves',
    optionB: 'learn them together from videos',
  },
  {
    optionA: 'send me a series of suggestive texts during work hours',
    optionB: 'a single, very explicit one after hours',
  },
  {
    optionA: 'have sex in a cozy tent while camping',
    optionB: 'in the back of a luxury SUV on a road trip',
  },
  {
    optionA: 'explore a fantasy involving food',
    optionB: 'one involving costumes',
  },
  {
    optionA: 'spend a cold day under the covers with me',
    optionB: 'a hot night under the stars',
  },
  {
    optionA: 'seduce me with a strip tease',
    optionB: 'with a lap dance',
  },
  {
    optionA: 'have sex in an elegant, antique chair',
    optionB: 'on a fluffy, modern rug',
  },
  {
    optionA: 'explore light BDSM',
    optionB: 'have a romantic, rose-petal-covered bed experience',
  },
  {
    optionA: 'have me leave sexy notes all over the house',
    optionB: 'send you provocative emails throughout the day',
  },
  {
    optionA: 'have me wear leather',
    optionB: 'lace',
  },
  {
    optionA: 'play a dirty question game',
    optionB: 'act out a naughty fantasy',
  },
  {
    optionA: 'have me write my desires on your body',
    optionB: 'whisper them in your ear',
  },
  {
    optionA: 'have sex with only one position allowed',
    optionB: 'have sex with no touching allowed',
  },
  {
    optionA: 'sneak a kiss in a crowded room',
    optionB: 'sneak a touch under the table',
  },
  {
    optionA: 'make love in front of a mirror',
    optionB: 'in complete darkness',
  },
  {
    optionA: 'leave a hickey where only you can see it',
    optionB: "in a place where it's noticeable",
  },
  {
    optionA: 'play a sexy truth or dare',
    optionB: 'a game of erotic hide and seek',
  },
  {
    optionA: 'watch your partner masturbate',
    optionB: 'have your partner watch you masturbate',
  },
  {
    optionA: 'switch clothes with your partner',
    optionB: 'be naked all weekend',
  },
  {
    optionA: 'play a game of truth or dare',
    optionB: 'strip poker',
  },
  {
    optionA: 'have really cheesy dirty talk',
    optionB: 'have completely silent sex',
  },
  {
    optionA: 'have sex with your celebrity crush',
    optionB: 'your high school crush',
  },
  {
    optionA: 'hear your neighbors have sex',
    optionB: 'have your neighbors hear you have sex',
  },
  {
    optionA: 'use sex toys',
    optionB: 'handcuffs',
  },
  {
    optionA: 'reveal your deepest sexual fantasy,',
    optionB: 'share your most embarrassing sex story',
  },
  {
    optionA: 'do OnlyFans together',
    optionB: 'publish our sex tape',
  },
  {
    optionA: 'have a love bite on your neck',
    optionB: 'on your chest',
  },
  {
    optionA: 'sleep with someone who is completely silent',
    optionB: "someone who's extremely loud while they have sex",
  },
  {
    optionA: 'receive a nude',
    optionB: 'a dirty text',
  },
  {
    optionA: 'try a new sex position',
    optionB: 'a new sex toy',
  },
  {
    optionA: 'watch porn',
    optionB: 'read erotica',
  },
  {
    optionA: 'have sex with your biggest celebrity crush',
    optionB: 'your favorite porn star',
  },
  {
    optionA: 'have a quickie and always orgasm',
    optionB: 'long passionate sex but never orgasm',
  },
  {
    optionA: 'have sex only in darkness',
    optionB: 'in too bright lighting',
  },
  {
    optionA: 'end a first date with sex',
    optionB: 'with passionate sex',
  },
  {
    optionA: 'have your partner only be able to use your hands',
    optionB: 'their mouth during foreplay',
  },
  {
    optionA: 'try pole dancing',
    optionB: 'lap dancing',
  },
  {
    optionA: 'have amazing foreplay',
    optionB: 'amazing sex? But never both',
  },
  {
    optionA: 'suck my toes',
    optionB: 'have your toes sucked',
  },
  {
    optionA: 'make a sex tape',
    optionB: 'write erotica about us',
  },
  {
    optionA: 'use wax play',
    optionB: 'spanking as foreplay',
  },
  {
    optionA: 'lose all sense of touch',
    optionB: 'all sense of taste',
  },
  {
    optionA: 'be bad at foreplay',
    optionB: 'be bad at sex',
  },
  {
    optionA: 'only orgasm once a year',
    optionB: 'orgasm every time you sneeze',
  },
]

export const WYR_QUESTION_COUNT = WYR_QUESTIONS.length

export function wyrQuestionKey(optionA: string, optionB: string): string {
  return `${optionA}\0${optionB}`
}

/** Pick `count` unique questions, preferring those played least often globally. */
export function pickWyrQuestions(count: number, usageCounts: Map<string, number> = new Map()): WyrQuestion[] {
  return pickLeastUsed(WYR_QUESTIONS, (q) => wyrQuestionKey(q.optionA, q.optionB), usageCounts, count)
}
