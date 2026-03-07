conversation_history = []

def add_user_message(text):
    conversation_history.append(text)

def get_history():
    return conversation_history

def message_count():
    return len(conversation_history)

def last_messages(n=10):
    return conversation_history[-n:]

last_score = None

def set_score(score):
    global last_score
    last_score = score

def get_score():
    return last_score