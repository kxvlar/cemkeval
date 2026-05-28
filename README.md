# CallRunner

AI agents that call places and do things for you.

CallRunner is a functional local MVP. The main screen works like a chatbot: type what you need handled, wait while the app simulates checking requirements, then fill the focused popup form. After that, the same chat can research, draft, and simulate calls/emails.

## Run it

```bash
npm start
```

For the no-Terminal version, open `public/index.html` directly.

Only use `http://127.0.0.1:3001/#/workspace` if you deliberately started the server with `PORT=3001 npm start`.

## Live demo trigger

The app starts clean with no visible samples. For a guided demo, type:

```text
demo
```

That starts a car insurance cancellation flow only after you ask for it.

## UnitedHealthcare demo

Type:

```text
UnitedHealthcare denied my claim and the bill was not covered. I need CallRunner to call UHC and ask what happened.
```

Then fill:

```text
Member full name
Date of birth
UHC member ID
Claim ID
Date of service
Provider or hospital name
```

After that, type:

```text
run agents
```

CallRunner will ask for authorization first, then schedule the call.
