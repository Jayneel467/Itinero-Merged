import streamlit as st
import uuid
from hotel_booking_backend import workflow 

if "thread_id" not in st.session_state:
    st.session_state.thread_id=str(uuid.uuid4())


config = {
    "configurable": {
        "thread_id": st.session_state.thread_id
    }
}

if "offerID" not in st.session_state:
       st.session_state['offerID'] = []

if "offer_id" not in st.session_state:
    st.session_state["offer_id"] = None       

if 'message_history' not in st.session_state:
    st.session_state['message_history']=[]

for message in st.session_state['message_history']:
    with st.chat_message(message['role']):
        st.text(message['content'])

state = workflow.get_state(config).values
        

user_input=st.chat_input("Type here")


if user_input:
    st.session_state['message_history'].append({'role' :'user', 'content':user_input})
    with st.chat_message('user'):
        st.text(user_input)
        #st.write(search_params)


    

    #st.session_state['message_history'].append({'role': 'assistant', 'content': })
    #with st.chat_message('assistant'):
       # st.text()

       #Check whether  this is a new chat or a resume after an interrupt

    state_snapshot = workflow.get_state(config)

    #st.write("State snapshot:",state_snapshot)

    if state_snapshot is None or state_snapshot.values == {}:

        # First invocation

        workflow.invoke(
            {
                "user_input": user_input
            },
            config=config
        )
    
    else:

        # Resume graph

        workflow.update_state(
            config,
            {
                "user_input": user_input,
                "offer_Id": st.session_state.offer_id 
            }
        )

        workflow.invoke(
            None,
            config=config
        )

    # Read latest graph state

    state = workflow.get_state(config).values

    #st.write("State dest is before hotel results:", state["destination"])

    # If graph paused after hotel search

    if state.get("hotel_results") and not state.get("budget"):
         
         with st.chat_message("assistant"):
              st.write("I found these hotels:")
              no_of_nights=(state["check_out"].date()-state["check_in"].date()).days
              st.write("Check in date:",state["check_in"] )
              st.write("Check out date :", state["check_out"])
              st.write("num of nights:", no_of_nights)


              for hotel in state["hotel_results"]:
                  hotel_id=hotel["id"]
                  st.write(
                      f"Hotel ID: {hotel['id']} ,     Hotel Name : {hotel['name']}   "
                   )
                  for hotel_price in state["hotel_results_with_price"]:
                      if hotel_price["hotelId"]==hotel_id:
                          for room_type in hotel_price["roomTypes"]:
                             price =(room_type["offerRetailRate"]["amount"])
                             currency=room_type["offerRetailRate"]["currency"]
                             st.write("Price:", price , currency)
                             break   
              
              st.markdown(
                "Please tell me your budget(per night) and preferred amenities."
            )
              
              #st.write("State dest after hotel results:", state["destination"])

         st.session_state['message_history'].append(
            {
                "role": "assistant",
                "content":
                "I found some hotels.Please tell me your budget(per night) and preferred amenities."
            }
        )     
         
    elif state.get("filtered_hotels") and not state.get("selected_hotel_id"):
                  
       # if(len(state.get("filtered_hotels"))==0):
        #    st.write("No hotels available")  

        #if len(state.get("filtered_hotels", [])) == 0:
        #  st.write("No hotels available")       

        with st.chat_message("assistant"):
            st.write("state dest before filtered hotels:", state["destination"])
            st.write("Here are the filtered hotels:")

            no_of_nights=(state["check_out"].date()-state["check_in"].date()).days

            for hotel in state["filtered_hotels"]:
                st.markdown(f" Hotel ID: {hotel["id"]} ,   Hotel Name: {hotel["name"]}")
                hotel_id=hotel["id"]

                for hotel in state["filtered_hotels_by_budget"]:
                    if hotel["hotelId"]==hotel_id:
                        for room_type in hotel["roomTypes"]:
                             price =(room_type["offerRetailRate"]["amount"])/(no_of_nights*state["no_of_rooms"])
                             currency=room_type["offerRetailRate"]["currency"]
                             roomName=room_type["rates"][0]["name"]
                             boardName=room_type["rates"][0]["boardName"]

                             if(state.get("room_name") is None) and (state.get("meal_plan") is None):
                                if (price)<=state["budget"]:
                      
                                   st.write("Room Name:",roomName, "  ","Price:",price , "", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)

                             elif(state.get("meal_plan") is None):
                                 if (price<= state["budget"] and (state["room_name"].lower() in roomName.lower())):
                                    st.write("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)


                             elif(state.get("room_name") is None):
                                 if (price<= state["budget"] and (state.get("meal_plan").lower() in boardName.lower())):
                                    st.write("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)


                             else:
                                if (price<= state["budget"] and (state.get("meal_plan").lower() in boardName.lower()) and ((state["room_name"].lower() in roomName.lower()))):
                                  st.write("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)
 #st.write("Room Type:", roomName, "Price:", price , currency, "Meal Type:", boardName)

            


            st.markdown(
                "Which hotel would you like to book?"
            )

            
            st.session_state["message_history"].append(
            {
                "role": "assistant",
                "content":
                "Which hotel would you like to book?"
            }
        )

    elif  state.get("hotel_results_with_price")== []:
        st.write("No hotels are available for the duration specified.")

    elif state.get("filtered_hotels_by_budget")==[]:
        st.write("No hotels are available within the budget specified")

    elif state.get("filtered_hotels")==[]:
        st.write("No hotels avaialble with the amenities specified.")             

    elif state.get("selected_hotel_id") and not state.get("offer_index"):
        
        no_of_nights=(state["check_out"].date()-state["check_in"].date()).days
        i=1
       # if "offerID" not in st.session_state:
       #   st.session_state["offerID"] = []
        #state["offerID"]=[]
        for hotel in state["filtered_hotels_by_budget"]:
            if hotel["hotelId"]==state["selected_hotel_id"]:
                st.write("Following are the Room Offers provided by the hotel ")
                for room_type in hotel["roomTypes"]:
                             price =(room_type["offerRetailRate"]["amount"])/(no_of_nights*state["no_of_rooms"])
                             currency=room_type["offerRetailRate"]["currency"]
                             roomName=room_type["rates"][0]["name"]
                             boardName=room_type["rates"][0]["boardName"]
                             offerId=room_type["offerId"] 
                             
                             
                             if(state.get("room_name") is None) and (state.get("meal_plan") is None):
                                if (price)<=state["budget"]:
                                   st.write(i)
                                   i=i+1
                                   state["offerID"].append(offerId)
                                     
                                   st.write("Room Name:",roomName, "  ","Price:",price , "", room_type["offerRetailRate"]["currency"],"  ","Meal Type:",boardName)

                             elif(state.get("meal_plan") is None):
                                 if (price<= state["budget"] and (state["room_name"].lower() in roomName.lower())):
                                    st.write(i)
                                    i=i+1
                                    state["offerID"].append(offerId)
                                    st.write("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","Meal Type:",boardName)


                             elif(state.get("room_name") is None):
                                 if (price<= state["budget"] and (state.get("meal_plan").lower() in boardName.lower())):
                                    st.write(i)
                                    i=i+1
                                    st.session_state["offerID"].append(offerId)
                                    st.write("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","Meal Type:",boardName)


                             else:
                                if (price<= state["budget"] and (state.get("meal_plan").lower() in boardName.lower()) and ((state["room_name"].lower() in roomName.lower()))):
                                  st.write(i)
                                  i=i+1
                                  state["offerID"].append(offerId)
                                  st.write("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)        
  
                             
        #st.write("Offer Ids:", st.session_state["offerID"])
        st.markdown("Which room offer would you like to book.Please specify the number.")    

        st.session_state["message_history"].append(
            {
                "role": "assistant",
                "content":
                "Which room offer would you like to book?"
            }
        )                      



    elif state.get("selected_hotel_id") and state.get("offer_index") and not state.get("prebook_id"):
        
        offer_index=state.get("offer_index")
        #for hotel in state["filtered_hotels_by_budget"] :
        #    if hotel["hotelId"]==state["selected_hotel_id"]:
        #            for room_type in hotel["roomTypes"]:

        #                if i<state["offer_index"]:
        #                    i=i+1
        #                elif i==state["offer_index"]:
        #                    offerId=room_type["offerId"]
        #                    state["offer_Id"]=offerId   

        st.session_state.offer_id=st.session_state["offerID"][(state["offer_index"])-1]
        state["offer_Id"]=st.session_state.offer_id

        st.write("offer ID",st.session_state.offer_id )
        st.write("Offer Id", state["offer_Id"])
        #st.write("State offer id", state["offer_Id"])
        no_of_nights=(state["check_out"].date()-state["check_in"].date()).days

        for hotel in state["filtered_hotels_by_budget"]:
            if hotel["hotelId"]==state["selected_hotel_id"]:
                for room_type in hotel["roomTypes"]:
                    if room_type["offerId"]==state["offer_Id"]:
                        price =(room_type["offerRetailRate"]["amount"])/(no_of_nights*state["no_of_rooms"])
                        currency=room_type["offerRetailRate"]["currency"]
                        roomName=room_type["rates"][0]["name"]
                        boardName=room_type["rates"][0]["boardName"]
                       # st.write("Hotel Id: ", hotel["hotelId"], "Room Type:",roomName , "Price:", price  ,currency, "Meal Type:", boardName )
                        st.write("would you like me to book the above hotel Room for you?")

                        st.session_state["message_history"].append(
                {
                    "role": "assistant",
                    "content":
                    "would you like me to book the above hotel Room for you?"
                }
             )             


    elif state.get("prebook_id") and not state.get("booking"):
        st.write("prebook Id:", state.get("prebook_id"))
        
        st.write("Enter first Name ,Last Name, email, phone. Please enter all the information.Missing any one will lead to no booking.")

        st.session_state["message_history"].append(
            {
                "role": "assistant",
                "content":
                "Enter first Name ,Last Name, email, phone"
            }
        ) 

    
    if user_input.lower() == "exit":
        st.chat_message("assistant").write("Goodbye!")
        st.stop()

        

if state.get("booking"):
        st.write("Your Booking is successful.",state["booking"])

        st.write("Hotel Name:", state["selected_hotel_name"])
        st.write("Check in date", state["check_in"])
        st.write("Check out date:",state["check_out"]) 

        
