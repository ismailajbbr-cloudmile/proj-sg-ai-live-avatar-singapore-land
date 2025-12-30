



class PromptService:
    def __init__(self):
        self.prompt = Prompt()

    def create_prompt(self, prompt: Prompt) -> Prompt:
        return self.prompt.create(prompt)

    def get_prompt_by_id(self, prompt_id: UUID) -> Prompt:
        return self.prompt.get_by_id(prompt_id)

    def update_prompt(self, prompt: Prompt) -> Prompt:
        return self.prompt.update_prompt(prompt)

    def delete_prompt(self, prompt_id: UUID) -> Prompt:
        return self.prompt.delete_prompt(prompt_id)