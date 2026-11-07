"""Builds src/habitLibrary.json from the table below. Run from packages/core:

    python3 scripts/build-habit-library.py

Each row: id | name | synonyms (English and Hinglish, comma separated) | type | target unit |
minimum description | minimum target | setup | days | time of day | identity | voice aliases

days is "daily", or "N/week: reason". type is b (yes/no), c (count), d (duration) or q (quit).
"""

import json
from pathlib import Path

DAILY_REASON = "Doing it every day makes it automatic."

ROWS = """
run | Run | running, go for a run, jog, jogging, daudna, daud | c | 5 km | Run at least 1 km | 1 | Put on running shoes | 3/week: rest days between runs help your legs recover | morning | The Athlete | run, running, jog
walk | Walk | walking, go for a walk, morning walk, evening walk, tahalna, sair, chalna | c | 30 min | Walk for 10 minutes | 10 | Put on your shoes and step outside | daily | evening | The Athlete | walk, walking
steps | Step count | steps, step count, 10k steps, daily steps, kadam | c | 8000 steps | Walk 3000 steps | 3000 | Take the stairs once | daily | anytime | The Athlete | steps
workout | Workout | work out, exercise, gym, go to the gym, training, kasrat, vyayam, gym jana | d | 45 min | Work out for 15 minutes | 15 | Pack your gym bag | 4/week: rest days help your muscles recover | morning | The Athlete | gym, workout, exercise
strength | Strength training | weights, lift, lifting, weight training, resistance training | d | 40 min | One set of each exercise | 10 | Lay out your weights | 3/week: muscles grow on the rest days in between | morning | The Athlete | weights, lifting
yoga | Yoga | do yoga, yog, yogasan, asana | d | 20 min | Five minutes of yoga | 5 | Roll out the mat | daily | morning | The Calm One | yoga
stretch | Stretch | stretching, mobility, flexibility | d | 10 min | Stretch for 2 minutes | 2 | Stand up from your desk | daily | evening | The Athlete | stretch, stretching
pushups | Push-ups | push ups, pushup, dand, dand baithak | c | 20 push-ups | Do 5 push-ups | 5 | Get down on the floor | daily | morning | The Athlete | push-ups, pushups
squats | Squats | squat, baithak | c | 30 squats | Do 10 squats | 10 | Stand with your feet apart | daily | morning | The Athlete | squats
plank | Plank | planks, core | d | 2 min | Hold a plank for 20 seconds | 0.5 | Get into position | daily | morning | The Athlete | plank
cycle | Cycle | cycling, bike, bike ride, ride a bike, cycle chalana | c | 10 km | Cycle for 2 km | 2 | Pump the tyres | 3/week: rest days between rides help you recover | morning | The Athlete | cycle, cycling, bike
swim | Swim | swimming, go swimming, tairna | d | 30 min | Swim for 10 minutes | 10 | Pack your swimming bag | 3/week: rest days between swims help you recover | morning | The Athlete | swim, swimming
hiit | HIIT | high intensity, interval training, tabata | d | 20 min | One 5-minute round | 5 | Put on your workout clothes | 3/week: hard sessions need a rest day after them | morning | The Athlete | hiit
dance | Dance | dancing, zumba, nachna | d | 20 min | Dance to one song | 4 | Put on a song | 3/week: a few sessions a week keeps it fun | evening | The Athlete | dance, dancing
sport | Play a sport | tennis, basketball, khelna, play a game | d | 60 min | Play for 20 minutes | 20 | Pack your kit | 2/week: a couple of games a week is a great start | evening | The Athlete | sport, game
suryanamaskar | Sun salutations | surya namaskar, suryanamaskar, sun salutation | c | 12 sun salutations | Do 3 sun salutations | 3 | Roll out the mat | daily | morning | The Athlete | surya namaskar
pranayam | Breathing exercises | pranayama, pranayam, breathwork, anulom vilom, kapalbhati | d | 10 min | Five slow breaths | 1 | Sit up straight | daily | morning | The Calm One | pranayam, breathing
meditate | Meditate | meditation, mindfulness, dhyan, dhyaan, sit quietly | d | 10 min | Meditate for 2 minutes | 2 | Sit down and close your eyes | daily | morning | The Calm One | meditate, dhyan
gratitude | Gratitude journal | gratitude, grateful, three good things, shukriya | b | | Write one thing you're grateful for | | Open your journal | daily | evening | The Calm One | gratitude
journal | Journal | journaling, diary, write a diary, diary likhna | c | 1 pages | Write one line | | Open your journal | daily | evening | The Calm One | journal, diary
reflect | Evening reflection | reflect, reflection, end of day reflection | d | 10 min | Think of one thing that went well | 1 | Sit down with a cup of tea | daily | evening | The Calm One | reflect
noscreen | Screen-free hour before bed | no screens before bed, no phone before bed, digital sunset | b | | Put the phone away 15 minutes before bed | | Put your phone on charge outside the bedroom | daily | evening | The Calm One | screens, phone
sleep | Sleep by 11 | sleep early, bedtime, go to bed early, jaldi sona, sona | b | | Be in bed by midnight | | Set a bedtime alarm | daily | evening | The Healthy One | sleep, bedtime
sleep8 | Sleep 8 hours | sleep eight hours, get enough sleep, neend | d | 8 hours | Sleep 7 hours | 7 | Set a bedtime alarm | daily | evening | The Healthy One | sleep
wakeup | Wake up early | wake early, rise early, get up early, jaldi uthna, subah jaldi uthna | b | | Get up within 15 minutes of the alarm | | Put the alarm across the room | daily | morning | The Early Riser | wake up, get up
makebed | Make the bed | make my bed, bed banana | b | | Pull the covers straight | | Get out of bed | daily | morning | The Organised One | bed
water | Drink water | water, drink water, hydrate, stay hydrated, paani, paani peena, pani pina, pani | c | 8 glasses | Drink 4 glasses | 4 | Fill a bottle | daily | anytime | The Healthy One | water, paani
fruit | Eat fruit | fruits, eat a fruit, phal khana, phal | c | 2 fruits | Eat one fruit | 1 | Put fruit where you can see it | daily | afternoon | The Healthy One | fruit
veg | Eat vegetables | vegetables, veggies, greens, sabzi, salad | c | 3 servings | Eat one serving of vegetables | 1 | Wash some vegetables | daily | afternoon | The Healthy One | vegetables, veggies
breakfast | Eat breakfast | breakfast, nashta | b | | Eat something small in the morning | | Set out a bowl | daily | morning | The Healthy One | breakfast, nashta
nosugar | No added sugar | no sugar, cut sugar, quit sugar, cheeni nahi, meetha nahi | q | | Skip sugar in one drink | | Clear sweets off the counter | daily | anytime | The Healthy One | sugar
nojunk | No junk food | no junk, no fast food, healthy eating, eat healthy | q | | Swap one snack for fruit | | Put a healthy snack in your bag | daily | anytime | The Healthy One | junk food
cook | Cook at home | cooking, cook dinner, home cooked meal, khana banana | b | | Make one simple dish | | Take out the ingredients | 4/week: a few home-cooked meals a week is a realistic start | evening | The Healthy One | cook, cooking
mealprep | Meal prep | prep meals, meal planning | b | | Plan tomorrow's lunch | | Write a shopping list | 1/week: one prep session covers the week | anytime | The Organised One | meal prep
vitamins | Take vitamins | vitamin, supplements, multivitamin, dawai, medicine, take medicine | b | | Take them with breakfast | | Put the bottle next to your cup | daily | morning | The Healthy One | vitamins, medicine
fast | Intermittent fasting | fasting, intermittent fast, upvaas, vrat | d | 12 hours | Fast for 10 hours | 10 | Finish dinner by 8 | daily | evening | The Healthy One | fasting
nosmoke | Quit smoking | no smoking, stop smoking, quit cigarettes, cigarette chhodna | q | | Delay the first cigarette by an hour | | Throw away one pack | daily | anytime | The Healthy One | smoking, cigarettes
noalcohol | No alcohol | quit drinking, no drinking, sober, sharab nahi | q | | Have a soft drink instead of one drink | | Keep a soft drink in the fridge | daily | evening | The Healthy One | alcohol, drinking
nocaffeine | Less caffeine | no coffee after 2, cut coffee, less coffee, less chai | q | | No coffee after 4 pm | | Switch to a smaller cup | daily | afternoon | The Healthy One | coffee, caffeine
floss | Floss | flossing, dental floss | b | | Floss one tooth | | Put the floss next to your toothbrush | daily | evening | The Healthy One | floss
skincare | Skincare | skin care routine, moisturise, sunscreen | b | | Wash your face | | Put your products by the sink | daily | evening | The Healthy One | skincare
posture | Check posture | sit straight, posture | b | | Sit up straight once | | Stick a note on your screen | daily | anytime | The Healthy One | posture
eyebreak | Eye breaks | rest my eyes, screen break | b | | Look away from the screen once | | Set a timer | daily | afternoon | The Healthy One | eye break
sunlight | Morning sunlight | get sunlight, dhoop | d | 10 min | Step outside for 2 minutes | 2 | Open the curtains | daily | morning | The Healthy One | sunlight
coldshower | Cold shower | cold showers, thanda paani | b | | End your shower with 10 cold seconds | | Lay out your towel | daily | morning | The Healthy One | cold shower
weigh | Weigh myself | weigh in, check weight, weight | b | | Step on the scale | | Put the scale where you'll see it | 1/week: once a week shows the trend without the daily noise | morning | The Healthy One | weigh
read | Read | reading, read a book, read books, padhna, kitab padhna, kitaab | c | 10 pages | Read at least 2 pages | 2 | Open the book | daily | evening | The Reader | read, reading, book
audiobook | Listen to an audiobook | audiobook, audio book, podcast, listen to a podcast | d | 20 min | Listen for 5 minutes | 5 | Queue the next chapter | daily | anytime | The Reader | audiobook, podcast
news | Read the news | news, newspaper, akhbaar, akhbar | d | 15 min | Read one article | 3 | Open the news app | daily | morning | The Reader | news
scripture | Read scripture | gita, bhagavad gita, quran, bible, path, paath | d | 10 min | Read one verse | 1 | Open the book | daily | morning | The Calm One | scripture, paath
study | Study | studying, revise, revision, padhai, padhai karna, homework | d | 60 min | Study for 15 minutes | 15 | Open your notes | daily | evening | The Learner | study, padhai
language | Learn a language | language practice, duolingo, learn spanish, learn french, learn english, learn german, learn japanese | d | 15 min | One lesson | 5 | Open the app | daily | anytime | The Learner | language, duolingo
vocab | Learn new words | vocabulary, vocab, flashcards, anki | c | 20 flashcards | Review 5 flashcards | 5 | Open your deck | daily | anytime | The Learner | flashcards, vocab
course | Online course | course, lecture, mooc, class, coursera, udemy | d | 30 min | Watch one short video | 10 | Open the course | 3/week: a few sessions a week keeps steady progress | evening | The Learner | course
code | Practise coding | coding, programming, leetcode, code, dsa | d | 45 min | Solve one small problem | 10 | Open your editor | daily | evening | The Maker | coding, code
problems | Solve practice problems | practice problems, maths practice, math problems, sawal | c | 10 problems | Solve 2 problems | 2 | Open the problem set | daily | evening | The Learner | problems, maths
notes | Review notes | revise notes, review my notes | d | 20 min | Read one page of notes | 5 | Open your notes | daily | evening | The Learner | notes
write | Write | writing, write words, write a book, likhna | c | 500 words | Write 100 words | 100 | Open the document | daily | morning | The Maker | write, writing
blog | Write a blog post | blogging, blog | b | | Write the outline | | Open a draft | 1/week: one post a week is a sustainable pace | anytime | The Maker | blog
draw | Draw | drawing, sketch, sketching, chitra banana | d | 20 min | Draw for 5 minutes | 5 | Open your sketchbook | daily | evening | The Creative | draw, sketch
paint | Paint | painting | d | 30 min | Paint for 10 minutes | 10 | Set out your brushes | 3/week: a few sessions a week leaves room for ideas | evening | The Creative | paint, painting
music | Practise an instrument | guitar, piano, practise guitar, practise piano, violin, flute, instrument, riyaaz, riyaz | d | 20 min | Play for 5 minutes | 5 | Take the instrument out | daily | evening | The Creative | guitar, piano, music, riyaz
sing | Sing | singing, vocal practice, gaana | d | 15 min | Sing one song | 4 | Warm up your voice | daily | evening | The Creative | sing, singing
photo | Take a photo | photography, photo a day | b | | Take one photo | | Keep your camera handy | daily | anytime | The Creative | photo
project | Work on my project | side project, project, build something, kaam | d | 60 min | Open it and do one small thing | 10 | Open the project | daily | evening | The Maker | project
deepwork | Deep work | focus, focused work, deep focus | d | 90 min | 25 minutes of focus | 25 | Close every other tab | 5/week: deep work fits the working week | morning | The Professional | deep work, focus, work
pomodoro | Pomodoros | pomodoro, focus sessions | c | 4 pomodoros | One pomodoro | 1 | Set the timer | 5/week: focus sessions fit the working week | morning | The Professional | pomodoro
inbox | Inbox zero | clear inbox, emails, check email | b | | Answer one email | | Open your inbox | 5/week: once each working day keeps it under control | afternoon | The Professional | inbox, email
plan | Plan my day | daily plan, to-do list, todo list, planning, plan tomorrow | b | | Write your top task | | Open your planner | daily | morning | The Organised One | plan, planning
weeklyreview | Weekly review | review my week | b | | List next week's top 3 | | Open your calendar | 1/week: once a week is all a review needs | anytime | The Organised One | weekly review
tidy | Tidy up | tidy, clean up, saaf safai, safai | d | 15 min | Put away five things | 2 | Pick up one thing | daily | evening | The Organised One | tidy, clean
deepclean | Deep clean | clean the house, deep cleaning, ghar ki safai | b | | Clean one room | | Get out the supplies | 1/week: once a week keeps the house in shape | anytime | The Organised One | clean, cleaning
dishes | Do the dishes | wash dishes, bartan, bartan dhona | b | | Wash your own plate | | Fill the sink | daily | evening | The Organised One | dishes
laundry | Laundry | washing clothes, kapde dhona | b | | Start one load | | Gather the clothes | 2/week: a couple of loads a week keeps up | anytime | The Organised One | laundry
plants | Water the plants | water plants, plants, paudhe | b | | Water one plant | | Fill the watering can | 3/week: most plants like a drink every couple of days | morning | The Organised One | plants
budget | Track spending | track expenses, expenses, budget, budgeting, hisaab, hisab | b | | Write down one expense | | Open the app | daily | evening | The Saver | spending, expenses
save | Save money | saving, savings, bachat | b | | Put aside a small amount | | Open your savings account | 1/week: once a week makes saving a routine | anytime | The Saver | savings
nospend | No-spend day | no spend, no shopping | q | | Skip one purchase | | Remove saved cards from one app | 2/week: a couple of no-spend days a week is a good start | anytime | The Saver | no spend
invest | Review investments | investing, sip | b | | Check one account | | Open the app | 1/week: once a week is plenty | anytime | The Saver | investments
callfamily | Call family | call mom, call mum, call dad, call parents, family call, ghar phone, maa ko phone | b | | Send a message | | Pick who to call | 2/week: a couple of calls a week keeps you close | evening | The Connector | call family, call mom
friend | Reach out to a friend | text a friend, message a friend, call a friend, dost | b | | Send one message | | Think of one friend | 2/week: a couple of check-ins a week is plenty | evening | The Connector | friend
kind | Act of kindness | kindness, be kind, help someone | b | | Say one kind thing | | Think of one person | daily | anytime | The Connector | kindness
compliment | Give a compliment | compliments | b | | Notice one good thing about someone | | Look for it | daily | anytime | The Connector | compliment
volunteer | Volunteer | volunteering, seva, sewa | d | 60 min | Volunteer for 20 minutes | 20 | Look up a local group | 1/week: once a week is a meaningful habit | anytime | The Connector | volunteer, seva
date | Date night | quality time, date with partner | b | | Share a cup of tea together | | Put it in the calendar | 1/week: once a week keeps it special | evening | The Connector | date night
kids | Play with the kids | time with kids, play with children, bachchon ke saath | d | 30 min | Play for 10 minutes | 10 | Put your phone away | daily | evening | The Connector | kids
pray | Pray | prayer, puja, pooja, namaz, worship, prarthana | d | 10 min | Say one prayer | 1 | Light a diya | daily | morning | The Calm One | pray, puja, namaz
chant | Chant | chanting, jap, japa, mantra, naam jap | c | 1 rounds | Chant for one minute | | Sit down with your mala | daily | morning | The Calm One | chant, jap
nature | Time in nature | go outside, park, nature walk | d | 20 min | Step outside for 5 minutes | 5 | Put on your shoes | 3/week: a few times a week lifts your mood | anytime | The Calm One | nature
nophone | Phone-free morning | no phone in the morning, no social media in the morning | q | | No phone for the first 15 minutes | | Charge your phone outside the bedroom | daily | morning | The Calm One | phone
lesssocial | Less social media | no social media, limit instagram, less instagram, less screen time | q | | Close the app once when you notice | | Move the app off your home screen | daily | anytime | The Calm One | social media
breathe | Breathing break | breathe, deep breaths, box breathing | b | | Take three slow breaths | | Notice your shoulders | daily | afternoon | The Calm One | breathe
selfcare | Self-care | me time, relax, rest | d | 20 min | Five minutes for yourself | 5 | Put the kettle on | daily | evening | The Calm One | self-care
therapy | Therapy homework | therapy, cbt worksheet | b | | Read your notes | | Open the worksheet | 1/week: one session of homework a week | anytime | The Calm One | therapy
learnskill | Learn a new skill | skill, practise a skill, upskill | d | 30 min | Practise for 10 minutes | 10 | Open your materials | 3/week: a few sessions a week builds a skill | evening | The Learner | skill
typing | Practise typing | typing practice, touch typing | d | 10 min | One typing test | 2 | Open the site | daily | anytime | The Learner | typing
chess | Play chess | chess, chess puzzles | d | 20 min | Solve one puzzle | 3 | Open the app | daily | evening | The Learner | chess
puzzle | Do a puzzle | crossword, sudoku, wordle | b | | Start one puzzle | | Open the puzzle | daily | morning | The Learner | puzzle
memorise | Memorise something | memorize, memorise a poem, shlok | d | 10 min | Learn one line | 2 | Open the text | daily | morning | The Learner | memorise
research | Read research | papers, read a paper, research papers | d | 30 min | Read one abstract | 5 | Open the paper | 3/week: a few papers a week is steady progress | anytime | The Learner | research
networking | Network | networking, linkedin, connect with someone | b | | Send one message | | Open LinkedIn | 2/week: a couple of connections a week | afternoon | The Professional | networking
jobapply | Apply for jobs | job search, job applications, apply | c | 3 items | Send one application | 1 | Open the job board | 5/week: weekdays are when replies come | morning | The Professional | apply, jobs
portfolio | Work on my portfolio | portfolio, resume, cv | d | 30 min | Update one line | 5 | Open the file | 2/week: a couple of sessions a week | evening | The Professional | portfolio
nooverwork | Stop work on time | log off on time, finish work on time | b | | Close the laptop at your set time | | Set a reminder | 5/week: on working days | evening | The Calm One | stop work
standup | Stand up and move | stand up, move every hour, desk break | b | | Stand for one minute | | Set an hourly timer | daily | afternoon | The Athlete | stand up
hangout | Spend time outdoors | outdoors, bahar jana | d | 30 min | Ten minutes outside | 10 | Open the door | daily | anytime | The Healthy One | outdoors
nosnooze | No snooze | don't snooze, stop snoozing | q | | Get up on the second alarm | | Put the alarm across the room | daily | morning | The Early Riser | snooze
morningroutine | Morning routine | morning ritual, subah ka routine | b | | Do the first step | | Lay things out the night before | daily | morning | The Early Riser | morning routine
eveningroutine | Evening routine | night routine, wind down, bedtime routine | b | | Do the first step | | Dim the lights | daily | evening | The Calm One | evening routine
brush | Brush teeth at night | brush my teeth, brushing | b | | Brush for one minute | | Put the toothbrush out | daily | evening | The Healthy One | brush
shower | Shower | bath, nahana | b | | Wash your face | | Lay out a towel | daily | morning | The Healthy One | shower
hair | Hair care | oil my hair, champi, hair oil | b | | Two minutes of care | | Put the oil out | 2/week: a couple of times a week is plenty | evening | The Healthy One | hair
sleepnoscreens | No phone in bed | phone out of bedroom | q | | Leave the phone on the table | | Get an alarm clock | daily | evening | The Calm One | phone in bed
tea | Herbal tea instead of coffee | green tea, herbal tea | b | | Swap one cup | | Buy a box of tea | daily | afternoon | The Healthy One | tea
protein | Eat protein | protein, eat enough protein | c | 3 servings | Eat one serving of protein | 1 | Keep eggs, dal or paneer in stock | daily | afternoon | The Healthy One | protein
lunch | Eat lunch away from my desk | lunch break, mindful lunch | b | | Five minutes away from the screen | | Pick a spot | 5/week: on working days | afternoon | The Calm One | lunch
nolateeat | No eating after 9 | no late snacks, no midnight snacks | q | | Stop eating by 10 | | Brush your teeth after dinner | daily | evening | The Healthy One | late eating
walkafterdinner | Walk after dinner | post dinner walk, after-dinner walk, khane ke baad tahalna | d | 15 min | Walk for 5 minutes | 5 | Put on your sandals | daily | evening | The Healthy One | walk after dinner
bp | Check blood pressure | blood pressure, bp check | b | | Take one reading | | Put the cuff by the bed | daily | morning | The Healthy One | blood pressure
sugarcheck | Check blood sugar | blood sugar, glucose, sugar test | b | | Take one reading | | Put the meter out | daily | morning | The Healthy One | blood sugar
physio | Physio exercises | physiotherapy, rehab, physio | d | 15 min | One exercise | 3 | Lay out the band | daily | morning | The Healthy One | physio
eyedrops | Eye drops | drops | b | | Put them in once | | Leave them by the sink | daily | morning | The Healthy One | eye drops
mood | Track my mood | mood, mood journal, how I feel | b | | Pick one word for today | | Open the journal | daily | evening | The Calm One | mood
affirm | Affirmations | affirmation, positive affirmations | b | | Say one out loud | | Stick a note on the mirror | daily | morning | The Calm One | affirmations
visualise | Visualise my goals | visualisation, vision board | d | 5 min | One minute | 1 | Look at your vision board | daily | morning | The Calm One | visualise
review_goals | Review my goals | goals, goal review | b | | Read your top goal | | Open your goals | 1/week: weekly keeps them in view | anytime | The Organised One | goals
email_parents | Write a letter | write letters, letter | b | | Write three lines | | Get the paper out | 1/week: once a week is lovely to receive | anytime | The Connector | letter
pet | Walk the dog | dog walk, walk my dog, kutta ghumana | d | 30 min | Walk around the block | 10 | Get the lead | daily | morning | The Athlete | dog
garden | Gardening | garden, kitchen garden, baagwani | d | 20 min | Five minutes in the garden | 5 | Put on gloves | 3/week: a few sessions a week keeps it growing | morning | The Creative | garden
craft | Craft | crafts, knitting, crochet, sewing, embroidery, silai | d | 20 min | Five minutes on the project | 5 | Set out your supplies | 3/week: a few sessions a week | evening | The Creative | knitting, craft
cookingnew | Try a new recipe | new recipe, cook something new | b | | Pick the recipe | | Save one recipe | 1/week: once a week keeps it fresh | evening | The Creative | recipe
videoedit | Make a video | youtube, video, content, reel | b | | Write the idea | | Open the editor | 2/week: a couple a week is sustainable | anytime | The Maker | video, content
designpractice | Practise design | design, figma, ui practice | d | 30 min | One small exercise | 10 | Open Figma | 3/week: a few sessions a week | evening | The Maker | design
learnmusic | Music theory | theory, ear training | d | 15 min | One exercise | 5 | Open the app | 3/week: a few sessions a week | evening | The Creative | music theory
poetry | Write poetry | poem, poems, shayari, kavita | b | | Write one line | | Open a notebook | 3/week: a few times a week keeps ideas flowing | evening | The Creative | poetry, shayari
declutter | Declutter one item | declutter, minimalism, get rid of things | c | 1 items | Pick one thing | | Find a box | daily | anytime | The Organised One | declutter
bills | Pay bills on time | bills, pay bills | b | | Check one due date | | Open your banking app | 1/week: once a week catches every due date | anytime | The Saver | bills
cleardesk | Clear my desk | tidy desk, clean desk | b | | Clear one corner | | Get a tray | 5/week: end of each working day | evening | The Organised One | desk
groceries | Plan groceries | shopping list, sabzi lana | b | | Write three items | | Open a list | 1/week: one list a week | anytime | The Organised One | groceries
hydrateam | Glass of water on waking | morning water, warm water, garam paani | b | | Take three sips | | Put a glass by the bed | daily | morning | The Healthy One | morning water
fastday | Weekly fast | upvas, ekadashi | b | | Skip one snack | | Plan your meals | 1/week: a weekly fast is the traditional rhythm | anytime | The Calm One | fast, vrat
quitgaming | Less gaming | no games, stop gaming, limit gaming | q | | Stop one game early | | Set a timer | daily | evening | The Calm One | gaming
nonetflix | Less TV | no tv, no netflix, less netflix, binge | q | | One episode only | | Turn off autoplay | daily | evening | The Calm One | tv, netflix
nopornography | Stay clean | no porn, nofap | q | | Leave the room when you notice an urge | | Install a blocker | daily | anytime | The Calm One | stay clean
nogossip | No gossip | stop gossiping | q | | Change the subject once | | Notice when it starts | daily | anytime | The Connector | gossip
noanger | Pause before reacting | anger, calm down, patience | b | | One breath before answering | | Notice your shoulders | daily | anytime | The Calm One | pause
learnhistory | Learn something new | learn, today I learned, til | d | 10 min | Read one article | 3 | Open a page | daily | anytime | The Learner | learn
teach | Teach someone | mentor, mentoring, tutoring, padhana | d | 30 min | Answer one question | 5 | Message your mentee | 1/week: one session a week | anytime | The Connector | teach, mentor
challenge30 | 30-day challenge | 30 day challenge, thirty day challenge | b | | Do the smallest version | | Pick the challenge | daily | anytime | The Maker | challenge
marathon | Train for a marathon | marathon training, half marathon | c | 8 km | Run 2 km | 2 | Lay out your kit | 4/week: rest days between runs prevent injury | morning | The Athlete | marathon, training
pullups | Pull-ups | pull ups, chin ups | c | 10 reps | One pull-up or hang | 1 | Hang from the bar | 3/week: rest days help your arms recover | morning | The Athlete | pull-ups
abs | Core workout | abs, ab workout, crunches | d | 10 min | Two minutes of core | 2 | Lie down on the mat | 3/week: core muscles need rest days too | morning | The Athlete | abs, core
skipping | Skipping rope | jump rope, skipping, rassi koodna | d | 10 min | Skip for 1 minute | 1 | Get the rope out | 3/week: rest days keep your joints happy | morning | The Athlete | skipping, jump rope
badminton | Badminton | play badminton | d | 45 min | Play one game | 15 | Pack your racquet | 2/week: a couple of games a week | evening | The Athlete | badminton
cricket | Cricket practice | cricket, nets, net practice | d | 60 min | Practise for 20 minutes | 20 | Pack your kit | 2/week: a couple of sessions a week | evening | The Athlete | cricket
football | Football | play football, soccer | d | 60 min | Play for 20 minutes | 20 | Pack your boots | 2/week: a couple of games a week | evening | The Athlete | football
"""

TYPES = {"b": "boolean", "c": "count", "d": "duration", "q": "quit"}


def parse(row: str) -> dict:
    parts = [p.strip() for p in row.split("|")]
    (hid, name, synonyms, kind, amount, min_desc, min_target, setup, days, tod, identity, aliases) = parts
    habit_type = TYPES[kind]
    target = unit = None
    if amount:
        number, unit = amount.split(" ", 1)
        target = float(number) if "." in number else int(number)
    minimum_target = None
    if min_target:
        minimum_target = float(min_target) if "." in min_target else int(min_target)
    if days == "daily":
        frequency, per_week, reason = "days", None, DAILY_REASON
    else:
        count, reason = days.split(": ", 1)
        frequency, per_week = "per_week", int(count.split("/")[0])
        reason = reason[0].upper() + reason[1:] + "."
    entry = {
        "id": hid,
        "name": name,
        "synonyms": [s.strip() for s in synonyms.split(",") if s.strip()],
        "type": habit_type,
        "target": target,
        "unit": unit,
        "minimum": {"description": min_desc, "target": minimum_target},
        "setup": setup,
        "frequency": frequency,
        "perWeek": per_week,
        "reason": reason,
        "timeOfDay": tod,
        "identity": identity,
        "voiceAliases": [a.strip() for a in aliases.split(",") if a.strip()],
    }
    if hid == "challenge30":
        entry["endsAfterDays"] = 30
    return entry


habits = [parse(line) for line in ROWS.strip().splitlines() if line.strip()]
out = Path(__file__).resolve().parent.parent / "src" / "habitLibrary.json"
out.write_text(json.dumps({"habits": habits}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(habits)} habits written to {out.name}")
