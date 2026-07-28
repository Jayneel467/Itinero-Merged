import uuid
import asyncio
from hotel_booking_backend_final import workflow




thread_id = str(uuid.uuid4())

config = {
    "configurable": {
        "thread_id": thread_id
    }
}

async def main():

 while True:

    #user_input = input("\nYou: ")

    #if user_input.lower() in ["exit", "quit"]:
    #    break

    

    snapshot = workflow.get_state(config)

    if snapshot.next:
        # Graph is waiting
        user_input = input("You: ")

        if user_input.lower() in ("exit", "quit"):
                break

        workflow.update_state(
                    config,
                    {
                        "user_input": user_input
                        #"offer_Id": st.session_state.offer_id
                        
                    }
                )
        
        result= await (workflow.ainvoke(
                    None,
                    config=config
                ))
        

    else:
        user_input = input("You: ")

        if user_input.lower() in ("exit", "quit"):
                break

        state = {
            "user_input": user_input
        }

        result = await workflow.ainvoke(
            state,
            config=config
        )
    

    print(1)



if __name__ == "__main__":
    asyncio.run(main())
