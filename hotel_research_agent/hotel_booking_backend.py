from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Annotated ,List
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
#from dotenv import load_dotenv
from pydantic import BaseModel
import uuid
import math

from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.tools import tool

import requests
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut

from datetime import datetime
from typing import List, Dict, Any , Optional, Literal
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.prompts import ChatPromptTemplate
import os
from dotenv import load_dotenv


load_dotenv()

OPENAI_API_KEY=os.getenv("OPENAI_API_KEY")


#OPENAI_API_KEY="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"
llm = ChatOpenAI(api_key = OPENAI_API_KEY, model = 'gpt-4.1-nano', temperature=0.0)



class HotelSearchRequest(BaseModel):
    area: str 
    destination: str
    country: str
    check_in:datetime
    check_out:datetime
    no_of_adults:int
    age_of_children:Optional[List[(int)]]
    no_of_rooms:int | None
    pet_included:Optional[Literal["Yes", "No"]]
    budget_currency:str
    guestNationality:str


class HotelFilterRequest(BaseModel):
    budget: float | None = None
    amenities: list[str] = []
    meal_plan: str | None = None
    room_type: str | None = None



class HotelSelectionRequest(BaseModel):
    hotel_name: str | None = None


class RoomOfferSelectionRequest(BaseModel):
    offer_index: int | None = None

class custInfo(BaseModel):
    first_name: str | None=None
    last_name:str | None=None
    email : str | None=None
    phone:str | None= None


class BookingConfirmation(BaseModel):
    confirmation: Literal["Yes", "No"]



class HotelState(TypedDict):
    user_input : str


    destination: str  #cityname
    area:str | None
    country:str | None
    check_in: datetime
    check_out: datetime
    guestnationality : str
    latitude: str
    longitude:str
    no_of_adults: int
    age_of_children:Optional[List[int]]
    no_of_rooms:int
    pet_included:Optional[Literal["Yes", "No"]]
    required_amenities:Optional[List[str]]
    meal_plan:Optional[str]
    room_name :Optional[str]
    budget:float
    budget_currency:str
    hotel_results:List[Dict[str, Any]]
    hotel_results_with_price : Optional[List[Dict[str,Any]]]=None 
    filtered_hotels_by_budget:Optional[List[Dict[str,Any]]]=None
    filtered_hotels: Optional[List[Dict[str, Any]]]= None
    selected_hotel_id: str
    selected_hotel_name:str 
    offer_index:int   #The index which the  user provides
    offer_Id:str      #actual offerId which is used in prebooking
    offerID: List[str]  #List of offer ID's of a particular hotel dispalyed to user
    final_confirmation:Literal["Yes", "No"]
    prebook_id:str
    first_name:str
    last_name:str
    email:str
    phone:str
    booking:str




structured_llm = llm.with_structured_output(HotelSearchRequest)

structured_llm_budget=llm.with_structured_output(HotelFilterRequest)

structured_llm_hotel_selection=llm.with_structured_output(HotelSelectionRequest)

structured_llm_offer_selection=llm.with_structured_output(RoomOfferSelectionRequest)

structured_llm_cust_info=llm.with_structured_output(custInfo)

structured_llm_final_confirmation=llm.with_structured_output(BookingConfirmation)


def get_coordinates2(state:HotelState):
    #query = f"{state["area"]}, {state["destination"]}"

      if  state.get("area") and  state.get("destination"):
        query=f"{state['area']}, {state['destination']}"
    
      elif state.get("area") and state.get("country"):
        query=f"{state['area']}, {state['country']}"

      elif state.get("destination") and state.get("country"):
        query=f"{state['destination'], state['country']}"

      elif state.get("destination"):
        query=f"{state['destination']}"

      elif state.get("country"):
         query=f"{state['country']}" 

    #else:
        #raiseValueError("No location information provided")         

    


      url = "https://nominatim.openstreetmap.org/search"

      params = {
        "q": query,
        "format": "json",
        "limit": 1
        }

      headers = {
        "User-Agent": "HotelSearchApp/1.0"
       }
    

      print("Params inside 2nd get coordinates", params)
    
      response = requests.get(url, params=params, headers=headers)
      response.raise_for_status()

      data = response.json()

      if not data:
        return None

      return {
        "latitude": float(data[0]["lat"]),
        "longitude": float(data[0]["lon"]),
        "display_name": data[0]["display_name"]
       }


def search_country_code(state: HotelState)-> str:
        # Initialize the geolocator with a unique user_agent name
     geolocator = Nominatim(user_agent="liteapi_helper_app")
     
     #if state["destination"]: 
     #  city_name=state['destination']

     #elif state["area"]:
     #  city_name=state["area"]
    
     #else :
     #  city_name=state["country"]
     city_name=state["guestnationality"]  
       
    # try:
        # Request location details from the geocoding service
     location = geolocator.geocode(city_name, addressdetails=True, language="en")
        
     if location and 'address' in location.raw:
            # Extract the 2-letter ISO country code and convert to uppercase
            country_code = location.raw['address'].get('country_code', '').upper()
            print("CC : ", country_code)
            #return { "country_code":  country_code}
            return country_code
     return None
     #except Exception as e:
     #   print(f"Error fetching data: {e}")
     #   return None


  
def fetch_hotels_from_api(state:HotelState)-> List[Dict[str,Any]]:

     url="https://api.liteapi.travel/v3.0/data/hotels"
     api_key = "sand_7aa9c679-c969-48b1-81eb-52849778cae3"

    # 2. Set the authorization headers
     headers = {
        "accept": "application/json",
        "X-API-Key": api_key
     }

    # 3. Specify your destination parameters (e.g., Paris, France)
     params={}
     result=get_coordinates2(state)
     if isinstance(result,dict):
            state["latitude"]=result["latitude"]
            state["longitude"]=result["longitude"]
               
            print ("Inside fetchAPI_Hotels:")
            print("state.latitude:", state["latitude"])
            print("state.longitude:", state["longitude"])
            
            params = {
                "latitude":state["latitude"],
                "longitude":state["longitude"],
                "radius": 1000       # radius is in meters
                        
            } 

     else:
            print(result)

    #print("Country Code:", Country_Code)
     print("Params to hotel", params)
    #print("Area:",state["area"])
     print("city name:", state["destination"])
    
     response=requests.get(url, headers=headers , params=params)
    
    
     hotel_data=[]
     if response.status_code == 200:
        print(response.text)
        hotel_data = response.json()
        print("Success! Found hotels.")
        print(hotel_data)
     else:
        print(f"Error {response.status_code}: {response.text}")
     return  (hotel_data['data'])




def hotel_search_node(state: HotelState):

    #results=fetch_hotels_from_api(destination= state["destination"], Country_Code=state["country_code"], check_in=state["check_in"] , check_out= state["check_out"])
     #print("number of rooms inside hotel_search_node:", state['no_of_rooms'])
     print("Inside hotel search node, state is :", state)
     results=fetch_hotels_from_api(state)

     return {'hotel_results' : results}



def create_occupancies(state:HotelState) -> List[dict]:
    """
    Creates LiteAPI occupancies array.

    Parameters
    ----------
    rooms : int
        Number of rooms requested.
    adults : int
        Total number of adults.
    children_ages : List[int]
        List containing age of every child.
        Example: [5, 8]
        Returns
    -------
    List[dict]
    """
    print("Inside create occupancies")

   # if state["no_of_rooms"] <= 0:
    #    raise ValueError("Rooms must be greater than 0")

    if state["no_of_adults"] <= 0:
        raise ValueError("At least one adult is required")

   # if state["no_of_adults"] < state["no_of_rooms"]:
   #     raise ValueError(
   #         "LiteAPI requires each occupied room to have at least one adult."
    #    )
    

    if state["no_of_rooms"] is None:
      state["no_of_rooms"] = math.ceil(state["no_of_adults"] / 2)
        
        # math.ceil(len(state["age_of_children"]) / 2)

    print("Number of Rooms:", state["no_of_rooms"] )    
     



    occupancies = [
        {
            "adults": 0,
            "children": []
        }
        for _ in range(state["no_of_rooms"])
    ]

    print("Occupancies array after initialization", occupancies)
    print("Number of rooms:", state["no_of_rooms"])

        # Give one adult to each room
    remaining_adults = state["no_of_adults"]
    for room in occupancies:
        room["adults"] = 1
        remaining_adults -= 1


        # Distribute remaining adults evenly
    room_index = 0
    while remaining_adults > 0:
        occupancies[room_index]["adults"] += 1
        remaining_adults -= 1
        room_index = (room_index + 1) % state["no_of_rooms"]



        # Distribute children evenly
    room_index = 0
    children = state.get("age_of_children")

    if children:
      for age in state.get("age_of_children"):
        occupancies[room_index]["children"].append(age)
        room_index = (room_index + 1) % state["no_of_rooms"]

   
    print ("Occupancies array inside create occupancy:", occupancies)
    return occupancies




def search_availability(state:HotelState, hotel_id: str) :
    #  API Configuration
  #URL = "https://api.liteapi.travel/v3.0/prices/hotels"
  #URL="https://api.liteapi.travel/v3.0/hotels/availability"
  URL="https://api.liteapi.travel/v3.0/hotels/rates"
  API_KEY = "sand_7aa9c679-c969-48b1-81eb-52849778cae3"  # Sandbox/Production key

  HEADERS = {
  
    "accept": "application/json",
    "content-type": "application/json",
    "X-API-Key": API_KEY
   }
  
  check_in_date=state["check_in"].strftime("%Y-%m-%d")
  check_out_date=state["check_out"].strftime("%Y-%m-%d")

  print("Type of check_in_date:", type(check_in_date))
  print("Type of check_out_date: ", type(check_out_date))

  #print(type( check_in_date))
  hotel_Ids=[]
  for hotel in state["hotel_results"]:
    hotel_Ids.append(hotel["id"])

  print("Length of Hotel Ids:", len(hotel_Ids))
  occupancies=create_occupancies(state) 


  print("Occupancy Array: " ,occupancies)
  guest_nationality=search_country_code(state)
  print("GuestNAtionality:", guest_nationality)

  #Request Payload
  payload= {

    "hotelIds": [hotel_id],
    "checkin": check_in_date,
    "checkout": check_out_date,
    "occupancies": occupancies,
    "currency": state["budget_currency"],
    "guestNationality": guest_nationality
    
         
  }


  response=requests.post(URL, json=payload, headers=HEADERS) 

  if response.status_code == 200:
        print("Response: ",response.text)
        if(response.text):
             rate_data = response.json()
             print("\n--- Live Rates Successfully Retrieved ---")
             print(rate_data)
             #for hotel in rate_data["data"]:
              
                 
              #   available_hotel_ids.append(hotel["hotelId"])
             #print("length of available ids:", len(available_hotel_ids))
             return rate_data   

  else:
        print(f"\nError {response.status_code}: {response.text}")  




def display_hotels(state:HotelState):
    i=1
    no_of_nights=(state["check_out"].date()-state["check_in"].date()).days

    print("Number of nights:", no_of_nights)
    budget_hotels=[]
    for hotel in state["hotel_results"]:
         print(i)
         print(f"Hotel Name :{hotel["name"]} ")
         print(f"Hotel ID : {hotel["id"]}")
         print(f"Hotel Description :{hotel["hotelDescription"]}")
         print(f"Hotel Image: {hotel["main_photo"]}")
         print(f"Rating: {hotel["rating"]}")
         print(f"Stars: {hotel["stars"]}")
        # print(f" Pet Friendly: {hotel["petFriendly"]}")
         rates_result=search_availability(state, hotel["id"])
         if rates_result.get("data"):
            
            for hotel in rates_result["data"]:
                 budget_hotels.append(hotel)
                 for room_type in hotel["roomTypes"]:
                    room_name = room_type["rates"][0]["name"]
                    room_Boardname=room_type["rates"][0]["boardName"]
                    price =(room_type["offerRetailRate"]["amount"])/(no_of_nights*state["no_of_rooms"])    #offerRetailRate gives the total price of the complete stay i.e price per room per night * no_of nights * no of rooms
                    #print("Type of price:", type(price))
                    price =(room_type["offerRetailRate"]["amount"])
                    currency=room_type["offerRetailRate"]["currency"]
                 
                    print("Room Name:",room_name, "  ","Price:", price, "", currency,"  ","BoardName:", room_Boardname)

         else:
           print("Rates_result in display:" , rates_result)
         #print(f"Price :, {price}, {currency}")

         i=i+1

    state["hotel_results_with_price"]=budget_hotels
    print("budget Hotels:", budget_hotels)
    return state 






def filter_by_budget(state:HotelState):
    print("state inside filter by budget:", state)

    filtered_hotels_by_budget=[] 
    no_of_nights=((state["check_out"].date())-(state["check_in"].date())).days
    
    print("Num of nights:", no_of_nights)

    for hotel in state["hotel_results_with_price"]:
        for room_type in hotel["roomTypes"]:
            price=room_type["offerRetailRate"]["amount"]/(no_of_nights*state["no_of_rooms"])
            roomName=room_type["rates"][0]["name"]
            boardName=room_type["rates"][0]["boardName"]
            #if (room_type["offerRetailRate"]["amount"])<=state["budget"] and ((room_type["rates"][0]["name"]) in state["room_type"]) and ((room_type["rates"][0]["boardName"])):
            if state.get("budget")==None:
                if(state.get("room_name"))==None and state.get("meal_plan")==None:
                  # filtered_hotels_by_budget=state["hotel_results_with_price"]
                  if(hotel not in (filtered_hotels_by_budget)):
                                 filtered_hotels_by_budget.append(hotel) 

                elif(state.get("meal_plan"))==None:
                    if state.get("room_name").lower() in roomName.lower():
                        if(hotel not in (filtered_hotels_by_budget)):
                                 filtered_hotels_by_budget.append(hotel) 

                elif(state.get("room_name"))==None:
                    if state.get("meal_plan").lower() in boardName.lower():
                        if(hotel not in (filtered_hotels_by_budget)):
                                 filtered_hotels_by_budget.append(hotel)                  
                
            else:    
               if(state.get("room_name"))==None and state.get("meal_plan")==None: 
                  if (price<=state["budget"]):
                     if(hotel not in (filtered_hotels_by_budget)):
                        filtered_hotels_by_budget.append(hotel)

               elif(state.get("room_name")) is None:
                   if(price<=state["budget"]) and (state.get("meal_plan").lower() in boardName.lower()):  
                          if(hotel not in (filtered_hotels_by_budget)):
                                 filtered_hotels_by_budget.append(hotel)   
         

               elif (state.get("meal_plan")) is None:
                   if(price<=state["budget"]) and (state.get("room_name").lower() in roomName.lower()):
                       if(hotel not in (filtered_hotels_by_budget)):
                           filtered_hotels_by_budget.append(hotel)

               else:
                  if(price<=state["budget"]) and (state.get("room_name").lower() in roomName.lower()) and (state.get("meal_plan").lower() in boardName.lower()):
                            if(hotel not in (filtered_hotels_by_budget)):
                                  filtered_hotels_by_budget.append(hotel)

            #if (price<=state["budget"]) and (state.get("room_name") in roomName ) and (state.get("meal_plan").lower() in boardName.lower()):
            #    if(hotel not in (filtered_hotels_by_budget)):
            #         filtered_hotels_by_budget.append(hotel)
            
      

    print("Filtered hotels by budget:", filtered_hotels_by_budget)
    #state["filtered_hotels_by_budget"] contains hotel data by rates of hotel
    if(len(filtered_hotels_by_budget)==0):
        print("No hotels available")
    state["filtered_hotels_by_budget"]=filtered_hotels_by_budget
    return state
     




def extract_amenities_node(state:HotelState):
       


    amenity_list = [
    "Free WiFi",
    "Parking",
    "Swimming Pool",
    "Room Service",
    "Lift",
    "wheelchair"    
     ]

   
    #hotels = state["hotel_results"]
    i=1
    print("Required Amenities:" , state["required_amenities"])

    filtered_hotels=[]

    #for hotel in state["hotel_results"]:
    for hotel in state["filtered_hotels_by_budget"]:
        hotel_id=hotel["hotelId"]

        for hotel in state["hotel_results"]:
            if hotel.get("id")==hotel_id:



               prompt = f"""
                     Extract only these amenities if present. Dont makeup your own results.

                     - Free WiFi
                     - Parking
                     - Lift
                     - Wheelchair Accessible
                     - Room Service
                     - Swimming pool

                   Hotel description:

                   {hotel["hotelDescription"]}

                   Return as a  list.
                  """

               #amenities = llm.invoke(prompt).content
               amenities = [
                    amenity for amenity in amenity_list
                    if amenity.lower() in hotel["hotelDescription"].lower()
                    ]
 
               print(i)
               print("Amenities are:", amenities)
               i=i+1
        
               print("Type of Amenities: ",type(amenities))
     # for req_amen in state["required_amenities"]:

               #available = [line.strip("- ").strip() for line in amenities.splitlines()]
               available=amenities

        #available=available.split('-')
               print("Available Before text lowering:", available)

               required = [x.lower() for x in state["required_amenities"]]
               available_lower=[x.lower() for x in available]

               print("Required:", required)
               print("Available:", available_lower)

        #if required.issubset(available):
            #state["filtered_hotels"].append(hotel)
               if all(item in available_lower for item in required):

            
                 filtered_hotels.append(hotel)
                    

               print("hotel:", hotel["id"])

         #   state[filtered_hotels_on_amenities].append(hotel)


    print("Filtered Hotels:", filtered_hotels)
    #state["filtered_hotels"] contains the hotel data by hotel description.
    state["filtered_hotels"]=filtered_hotels
    return state
    #return {"filtered_hotels": filtered_hotels}






def display_filtered_hotels(state:HotelState):

    no_of_nights=(state["check_out"].date()-state["check_in"].date()).days
     
    for hotel in state["filtered_hotels"]:
         print(f"Hotel :{ hotel["id"]}")
         print(f"Hotel Name :{hotel["name"]} ")
         print(f"Hotel Description :{hotel["hotelDescription"]}")
         print(f"Hotel Image: {hotel["main_photo"]}")
         print(f"Rating: {hotel["rating"]}")
         print(f"Stars: {hotel["stars"]}")
         hotel_id=hotel["id"]
         for hotel in state["hotel_results_with_price"]:
             if hotel.get("hotelId")==hotel_id:  
               for room_type in hotel["roomTypes"]:
                  price=room_type["offerRetailRate"]["amount"]/(no_of_nights*state["no_of_rooms"])
                  roomName=room_type["rates"][0]["name"]
                  boardName=room_type["rates"][0]["boardName"]
                  
                  if(state.get("room_name") is None) and (state.get("meal_plan") is None):
                     if (price)<=state["budget"]:
                      
                         print("Room Name:",roomName, "  ","Price:",price , "", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)

                  elif(state.get("meal_plan") is None):
                        if (price<= state["budget"] and (state["room_name"].lower() in roomName.lower())):
                           print("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)


                  elif(state.get("room_name") is None):
                      if (price<= state["budget"] and (state.get("meal_plan").lower() in boardName.lower())):
                          print("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)


                  else:
                      if (price<= state["budget"] and (state.get("meal_plan").lower() in boardName.lower()) and ((state["room_name"].lower() in roomName.lower()))):
                            print("Room Name:", roomName , " ", "Price:", price , " ", room_type["offerRetailRate"]["currency"],"  ","BoardName:",boardName)


                                   




def process_the_user_input(state: HotelState):
   
   prompt = ChatPromptTemplate.from_messages(
      [
          (
              "system",
              """
             Extract the hotel booking details from the user's request.

             Today's date is 5 July 2026.
             If the year is omitted, infer the most appropriate future date.
             Return check_in and check_out as ISO 8601 dates.

            If the user explicitly mentions the number of rooms (e.g., "2 rooms", "book 3 rooms"), extract that value.
            If the user does not explicitly specify the number of rooms, set no_of_rooms to null. 
             
             Extract guestnationality which is the country of origin of the user.

             If a value is missing, leave it null.

             """
          ),
          ("human", "{user_input}")
      ]
   )
   
   chain= prompt | structured_llm


   search_params=chain.invoke(
      {
       "user_input": state["user_input"]
           
      })
   
   print("Search Params:", search_params)
   print("Type of Search_params check in:",type(search_params.check_in))
   print("Search params Check_in:",search_params.check_in)
   print("Type of search_params check out:", type(search_params.check_out))
   print("Search params check out:", search_params.check_out)
   
   #state:HotelState

   return {
         "area": search_params.area,
        "destination": search_params.destination,
        "country": search_params.country,
         "check_in":search_params.check_in,
         "check_out": search_params.check_out,
         "no_of_adults":search_params.no_of_adults,
         "age_of_children": search_params.age_of_children,
         "no_of_rooms":search_params.no_of_rooms,
         "pet_included": search_params.pet_included,
         "budget_currency":search_params.budget_currency,
         "guestnationality":search_params.guestNationality

   }   




def process_the_budget_input(state:HotelState):
      


    prompt = ChatPromptTemplate.from_messages(
       [
          (
              "system",
              """
             You are an information extraction assistant.

              Extract the hotel filtering preferences mentioned in the user's request.
              
              Rules:
              Instructions:
              - Extract the budget as a numeric value only. Do not include currency symbols.
              -Extract the amenities exactly as stated by the user. Preserve all descriptive words (e.g., "free", "complimentary", "private", "included"). Do not normalize, shorten, or substitute amenity names. Return each amenity as a separate string in the amenities list.
              - Extract the requested meal plan if specified (e.g., "Breakfast", "Half Board", "Full Board", "All Inclusive").
              - Extract the requested room type if specified (e.g., "Deluxe Room", "Suite", "Standard Room", "Executive Room", "Family Room").
              - Only extract information that is explicitly mentioned by the user.
              - Do not infer or guess missing information.
              - If the budget is not mentioned, return null.
              - If no amenities are mentioned, return an empty list.
              - If no meal plan is mentioned, return null.
              - If no room type is mentioned, return null.
              """
          ),
          ("human", "{user_input}")
      ]
   )


    chain= prompt | structured_llm_budget


    filter_params=chain.invoke(
      {
       "user_input": state["user_input"]
           
      }) 
  
    print("Filter Params:", filter_params)

    return{
        "budget":filter_params.budget,
        "required_amenities":filter_params.amenities,
        "meal_plan":filter_params.meal_plan,
        "room_name":filter_params.room_type
    }





def process_the_selected_hotel_input(state:HotelState):


    prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
              You are an information extraction assistant.

              The user is selecting one hotel from the list below.

              Available hotels:
              {hotel_list}

              Instructions:
              - If the user mentions a hotel by name, extract that hotel name.
              - If the user refers to a hotel by its position (e.g. "first", "second", "last"), map it to the corresponding hotel in the list.
              - If the selection is ambiguous, return null.
              - Do not invent hotel names.
              - Return only the structured output.
               """
        ),
        ("human", "{user_input}")
    ]
)


    chain= prompt | structured_llm_hotel_selection
    
    selected_hotel = chain.invoke(
    {
        "user_input": state["user_input"],
        "hotel_list": [
            hotel["name"]
            for hotel in state["filtered_hotels"]
        ]
    }
)
  
    print("Selected hotel:", selected_hotel)
    
    #state["selected_hotel_name"]=selected_hotel.hotel_name

    selected_hotel_name=selected_hotel.hotel_name

    selected_hotel_id = None

    for hotel in state["filtered_hotels"]:
      if hotel["name"] == selected_hotel.hotel_name:
        selected_hotel_id = hotel["id"]
        break

    return {
    "selected_hotel_id": selected_hotel_id,
     "selected_hotel_name":selected_hotel_name 
      }

  
    
def process_the_room_offer(state:HotelState):


    prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
              The user is selecting one of the displayed room offers.

              Extract the room offer index selected by the user.

              Rules:
             - If the user selects a room offer by its number (e.g. "1", "option 2", "book the third one"), return that number as room_offer_index.
             - If the user has not selected a room offer, return room_offer_index as null.
             - Do not infer or guess a selection.
               """
        ),
        ("human", "{user_input}")
    ]
)
    chain= prompt | structured_llm_offer_selection

    offer_selected=chain.invoke({"user_input": state["user_input"]})
      
    return{ "offer_index": offer_selected.offer_index
         

     }   


def process_the_final_response(state:HotelState):
    prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
              You are processing the user's final hotel booking confirmation.

              Analyze the user's latest message and decide whether they are clearly confirming the booking.

              Return:

               Yes → The user clearly wants to proceed with the booking.

               No→ The user declines, cancels, wants changes, asks another question, or the intent is unclear.
               """
        ),
        ("human", "{user_input}")
    ]
)
    chain= prompt | structured_llm_final_confirmation

    confirm=chain.invoke({"user_input": state["user_input"]})
      
    return{ "final_confirmation" : confirm.confirmation}
                


def process_the_cust_info(state:HotelState):
     
    prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
              You are an information extraction assistant.

               Extract the guest details required for hotel booking from the user's message.

               Extract only the following fields:
               - first_name
               - last_name
               - email
                - phone

                Rules:
                - Extract only information explicitly provided by the user.
                  - Do not infer or guess any missing values.
                 - If a field is not mentioned, return null for that field.
                 - Preserve the exact spelling of names, email addresses, and phone numbers.
                 - If multiple values are provided for the same field, use the one that appears to be intended for the booking.
                 - Return only the structured output matching the provided schema.
               """
        ),
        ("human", "{user_input}")
    ]
)
    chain= prompt | structured_llm_cust_info

    cust_details=chain.invoke({"user_input": state["user_input"]})
      
    return{ "first_name": cust_details.first_name,
             "last_name":cust_details.last_name,
             "email":cust_details.email,
             "phone": cust_details.phone
         

     }   






API_KEY = "sand_7aa9c679-c969-48b1-81eb-52849778cae3"  # Sandbox API
PREBOOK_URL = "https://book.liteapi.travel/v3.0/rates/prebook"
BOOK_URL = "https://book.liteapi.travel/v3.0/rates/book"

HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

def prebook_room(state:HotelState):
    #if state["final_confirmation"]=="Yes":
    if state.get("final_confirmation", "").strip().lower() == "yes":
     # offerId=state["offerID"][(state["offer_index"])-1]
      offerId=state["offer_Id"]
      #offerId=state["offer_Id"]

      payload = {
        "offerId": offerId,
        "usePaymentSdk": False
    }


      response = requests.post(
        PREBOOK_URL,
        headers=HEADERS,
        json=payload
    )   

      #response.raise_for_status()
      print("Status in prebook:", response.status_code)
      print("Response in prebook room :", response.text)

      prebook=response.json()

      #prebook_id=prebook["prebookId"]

    #return response.json()["prebookId"]

      #return {"prebook_id":response.json()["prebook_id"]}
     # print(response.json())
      print("PrebookId:", prebook["data"]["prebookId"])
      return{"prebook_id": prebook["data"]["prebookId"]}
    
    else:
        print("User Denied booking")
        return{"prebook_id":""}




def book_room(state:HotelState):


    prebook_id=state.get("prebook_id")
    firstName=state.get("first_name")
    lastName=state.get("last_name")
    email=state.get("email")
    phone=state.get("phone")

    print("First NAme:",firstName)
    print("Second Name:", lastName)
    print("Email:",email)
    print("Phone:", phone)
    
    client_reference = str(uuid.uuid4())

    payload = {
        "prebookId": prebook_id,

        "clientReference": client_reference,

        "holder": {
            "firstName": firstName,
            "lastName": lastName,
            "email": email,
            "phone":phone
        },

        "payment": {
            "method": "ACC_CREDIT_CARD"
        }
    }

    response = requests.post(
        BOOK_URL,
        headers=HEADERS,
        json=payload
    )

    #response.raise_for_status()
    booking=response.json()

    #return {state["booking"]:booking}
    #print ("Booking:",booking)

    return{"booking": booking['data']['bookingId']}


graph=StateGraph(HotelState)

graph.add_node("process_the_user_input", process_the_user_input)
graph.add_node("search_hotels", hotel_search_node)
graph.add_node("display_hotels", display_hotels)
graph.add_node("process_the_budget_input", process_the_budget_input)
graph.add_node("filter_by_budget",filter_by_budget)
graph.add_node("extract_amenities", extract_amenities_node)
graph.add_node("display_filtered_hotels", display_filtered_hotels)
graph.add_node("process_the_selected_hotel_input", process_the_selected_hotel_input)
graph.add_node("process_the_room_offer", process_the_room_offer)
graph.add_node("process_the_final_response",process_the_final_response)
graph.add_node("prebook_room", prebook_room)
graph.add_node("process_the_cust_info", process_the_cust_info)
graph.add_node("Book_room", book_room)


graph.add_edge(START, "process_the_user_input")
graph.add_edge("process_the_user_input","search_hotels")
graph.add_edge("search_hotels", "display_hotels")
graph.add_edge("display_hotels", "process_the_budget_input")
graph.add_edge("process_the_budget_input", "filter_by_budget")
graph.add_edge("filter_by_budget", "extract_amenities")
graph.add_edge("extract_amenities","display_filtered_hotels")
graph.add_edge("display_filtered_hotels", "process_the_selected_hotel_input")
graph.add_edge("process_the_selected_hotel_input","process_the_room_offer" )
graph.add_edge("process_the_room_offer", "process_the_final_response")
graph.add_edge("process_the_final_response","prebook_room")
graph.add_edge("prebook_room", "process_the_cust_info")
graph.add_edge("process_the_cust_info", "Book_room")
graph.add_edge("Book_room", END)


checkpointer = InMemorySaver()

workflow=graph.compile(checkpointer=checkpointer,interrupt_after=["display_hotels", "display_filtered_hotels","process_the_selected_hotel_input","process_the_room_offer","prebook_room"])
#workflow=graph.compile()

#graph2=StateGraph(HotelState)
#graph.add_node("filter_by_budget",filter_by_budget)
#graph.add_node("extract_amenities", extract_amenities_node)
#graph.add_node("display_filtered_hotels", display_filtered_hotels)

#graph.add_edge(START,"filter_by_budget")
#graph.add_edge("filter_by_budget", "extract_amenities")
#graph.add_edge("extract_amenities","display_filtered_hotels")
#graph.add_edge("display_filtered_hotels", END)

#filtered_hotels_workflow=graph2.compile()
